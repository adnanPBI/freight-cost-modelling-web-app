import crypto from 'node:crypto';
import { AllocationPosition, CommercialStatus, ImportStatus, ImportType, Prisma, RateCardStatus } from '@prisma/client';
import { prisma } from './prisma';
import { appendRevision } from './history';
import { assertEUR } from './tenant';
import {
  parseAllocationWorkbook, parsePostcodeWorkbook, parseRateWorkbook, parseVolumeWorkbook,
  normalizePostcode, type ImportIssue, type RateMode
} from './importers';

const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const token=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
const date=(value:unknown)=>value?new Date(String(value)):undefined;
const pos=(order:number):AllocationPosition=>({
  1:'PRIMARY',2:'SECONDARY',3:'TERTIARY',4:'BACKUP_1',5:'BACKUP_2'
} as const)[order as 1|2|3|4|5];

async function findCarrier(tx:Prisma.TransactionClient,tenantId:string,label:string){
  const direct=await tx.carrier.findFirst({
    where:{tenantId,OR:[
      {code:{equals:label,mode:'insensitive'}},
      {name:{equals:label,mode:'insensitive'}},
      {aliases:{some:{alias:{equals:label,mode:'insensitive'}}}}
    ]},
    include:{aliases:true}
  });
  if(direct) return direct;
  const all=await tx.carrier.findMany({where:{tenantId},include:{aliases:true}});
  const wanted=token(label);
  return all.find(c=>token(c.code)===wanted||token(c.name)===wanted||c.aliases.some(a=>token(a.alias)===wanted))??null;
}

async function findDc(tx:Prisma.TransactionClient,tenantId:string,label:string){
  const all=await tx.distributionCentre.findMany({where:{tenantId}});
  const wanted=token(label);
  const stripped=wanted.endsWith('DC')?wanted.slice(0,-2):wanted;
  return all.find(d=>token(d.code)===wanted||token(d.code)===stripped||token(d.name)===wanted||d.aliases.some(a=>token(a)===wanted))??null;
}

async function findMode(tx:Prisma.TransactionClient,tenantId:string,label:string){
  return tx.transportMode.findFirst({where:{tenantId,code:{equals:label,mode:'insensitive'},active:true}});
}

function rateStatus(validFrom:Date,validTo:Date):RateCardStatus{
  const now=new Date();
  if(validFrom>now) return 'FUTURE';
  if(validTo<now) return 'EXPIRED';
  return 'ACTIVE';
}

export async function previewImport(args:{
  tenantId:string;userId:string;type:ImportType;filename:string;buffer:Buffer;modeOverride?:RateMode
}){
  const checksum=crypto.createHash('sha256').update(args.buffer).digest('hex');
  const prior=await prisma.importJob.findFirst({
    where:{tenantId:args.tenantId,type:args.type,checksum,status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},
    orderBy:{createdAt:'desc'}
  });
  let parsed:any;
  if(args.type==='RATE_CARD') parsed=await parseRateWorkbook(args.buffer,{modeOverride:args.modeOverride});
  else if(args.type==='ALLOCATION_KEY') parsed=await parseAllocationWorkbook(args.buffer);
  else if(args.type==='VOLUME') parsed=await parseVolumeWorkbook(args.buffer);
  else parsed=await parsePostcodeWorkbook(args.buffer);
  const issues:ImportIssue[]=[...(parsed.issues??[])];
  if(prior) issues.unshift({sheet:'Workbook',message:`This file checksum was already committed on ${prior.committedAt?.toISOString()??prior.createdAt.toISOString()}.`,severity:'warning'});
  const errors=issues.filter(i=>i.severity==='error').length;
  const warnings=issues.filter(i=>i.severity==='warning').length;
  const job=await prisma.importJob.create({
    data:{
      tenantId:args.tenantId,type:args.type,filename:args.filename,checksum,status:'VALIDATED',
      successRows:parsed.rows?.length??0,errorRows:errors,warningRows:warnings,issues:json(issues),
      parsedData:json(parsed),overrides:json({modeOverride:args.modeOverride}),createdById:args.userId
    }
  });
  return {...job,parsed,issues,duplicateOf:prior?.id??null};
}

export async function commitImport(args:{
  tenantId:string;userId:string;jobId:string;overrides?:Record<string,unknown>
}){
  const job=await prisma.importJob.findFirst({where:{id:args.jobId,tenantId:args.tenantId}});
  if(!job) throw new Error('Import job not found');
  if(job.status==='COMPLETED'||job.status==='COMPLETED_WITH_ERRORS') throw new Error('Import job has already been committed');
  const issues=(job.issues as unknown as ImportIssue[]|null)??[];
  if(issues.some(i=>i.severity==='error')) throw new Error('Import contains validation errors. Correct the workbook and preview again.');
  const overrides=args.overrides??{};
  try{
    let result:unknown;
    if(job.type==='RATE_CARD') result=await commitRate(job,args.userId,overrides);
    else if(job.type==='ALLOCATION_KEY') result=await commitAllocations(job,args.userId,overrides);
    else if(job.type==='VOLUME') result=await commitVolumes(job,args.userId);
    else result=await commitPostcodes(job,args.userId);
    await prisma.importJob.update({where:{id:job.id},data:{status:'COMPLETED',overrides:json(overrides),committedAt:new Date()}});
    return result;
  }catch(error){
    await prisma.importJob.update({where:{id:job.id},data:{status:'FAILED'}});
    throw error;
  }
}

async function commitRate(job:any,userId:string,overrides:Record<string,unknown>){
  const parsed=job.parsedData as any;
  const rows=parsed.rows as any[];
  const meta=parsed.metadata??{};
  const carrierLabel=String(overrides.carrier??meta.supplierCompany??'').trim();
  const dcLabel=String(overrides.dc??meta.originDc??'').trim();
  const modeCode=String(overrides.mode??meta.transportMode??rows[0]?.mode??'').trim().toUpperCase();
  const validFrom=date(overrides.validFrom??meta.validFrom);
  const validTo=date(overrides.validTo??meta.validTo);
  const commercialStatus=String(overrides.commercialStatus??'CONTRACTED_ACTIVE') as CommercialStatus;
  assertEUR(overrides.currency??meta.currency??'EUR');
  if(!carrierLabel||!dcLabel||!modeCode||!validFrom||!validTo) throw new Error('Carrier, DC, Mode, Valid From and Valid To are required before committing a rate card.');
  if(validTo<validFrom) throw new Error('Valid To must be on or after Valid From.');
  return prisma.$transaction(async tx=>{
    const carrier=await findCarrier(tx,job.tenantId,carrierLabel); if(!carrier) throw new Error(`Carrier "${carrierLabel}" is not in the Carrier Master.`);
    const dc=await findDc(tx,job.tenantId,dcLabel); if(!dc) throw new Error(`DC "${dcLabel}" is not configured.`);
    const mode=await findMode(tx,job.tenantId,modeCode); if(!mode) throw new Error(`Mode "${modeCode}" is not configured.`);
    const latest=await tx.rateCard.findFirst({where:{tenantId:job.tenantId,carrierId:carrier.id,dcId:dc.id,modeId:mode.id},orderBy:{version:'desc'}});
    const card=await tx.rateCard.create({data:{
      tenantId:job.tenantId,carrierId:carrier.id,dcId:dc.id,modeId:mode.id,currency:'EUR',
      validFrom,validTo,commercialStatus,status:rateStatus(validFrom,validTo),originalFilename:job.filename,
      uploadChecksum:job.checksum,version:(latest?.version??0)+1,supersedesId:latest?.id,notes:String(overrides.notes??'')||undefined,
      metadata:json(meta),createdById:userId
    }});
    if(latest && String(overrides.supersedePrevious??'true')!=='false'){
      await appendRevision(tx,job.tenantId,'RateCard',latest.id,latest,'SUPERSEDED',userId);
      await tx.rateCard.update({where:{id:latest.id},data:{status:'SUPERSEDED'}});
    }
    for(const r of rows){
      if(r.mode!==mode.code && !(mode.code==='PALLET'||mode.code==='LTL-PALLET')) throw new Error(`Workbook mode ${r.mode} does not match selected mode ${mode.code}.`);
      let lane=await tx.lane.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,destinationCountry:r.destinationCountry,destinationRegion:r.destinationRegion}});
      if(!lane) lane=await tx.lane.create({data:{
        tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,originCountry:r.originCountry||dc.countryCode,
        destinationCountry:r.destinationCountry,destinationRegion:r.destinationRegion,laneIdentifier:r.laneIdentifier
      }});
      const laneRate=await tx.laneRate.create({data:{
        tenantId:job.tenantId,rateCardId:card.id,laneId:lane.id,baseRate:r.baseRate,
        transitDays:r.transitDays,assetModel:r.assetModel,capacity:r.capacity,committedTrucks:r.committedTrucks,
        sourceRow:r.row,sourceMetadata:r.sourceMetadata?json(r.sourceMetadata):undefined
      }});
      for(const [qty,rate] of Object.entries(r.palletBands??{})){
        await tx.palletBand.create({data:{tenantId:job.tenantId,laneRateId:laneRate.id,palletQty:Number(qty),rate:Number(rate)}});
      }
    }
    await tx.auditEvent.create({data:{tenantId:job.tenantId,userId,entityType:'RateCard',entityId:card.id,action:'IMPORT',summary:`Imported ${job.filename}`,details:json({rows:rows.length,version:card.version})}});
    return {rateCardId:card.id,version:card.version,rows:rows.length};
  });
}

async function commitAllocations(job:any,userId:string,overrides:Record<string,unknown>){
  const parsed=job.parsedData as any; const rows=parsed.rows as any[];
  const groups=new Map<string,any[]>();
  for(const row of rows){const key=token(row.dc)+'|'+row.mode; groups.set(key,[...(groups.get(key)??[]),row]);}
  const created:string[]=[];
  for(const group of groups.values()){
    await prisma.$transaction(async tx=>{
      const dc=await findDc(tx,job.tenantId,group[0].dc); if(!dc) throw new Error(`Unknown DC ${group[0].dc}`);
      const mode=await findMode(tx,job.tenantId,group[0].mode); if(!mode) throw new Error(`Unknown mode ${group[0].mode}`);
      const existingDraft=await tx.allocationKey.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,status:'DRAFT'}});
      if(existingDraft && String(overrides.replaceDraft??'false')!=='true') throw new Error(`A Draft allocation key already exists for ${dc.code}/${mode.code}. Choose replace/merge explicitly.`);
      if(existingDraft){
        await appendRevision(tx,job.tenantId,'AllocationKey',existingDraft.id,existingDraft,'REPLACED',userId);
        await tx.allocationRule.deleteMany({where:{tenantId:job.tenantId,allocationKeyId:existingDraft.id}});
        await tx.allocationKey.delete({where:{id:existingDraft.id}});
      }
      const active=await tx.allocationKey.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,status:'ACTIVE'},orderBy:{version:'desc'}});
      const latest=await tx.allocationKey.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id},orderBy:{version:'desc'}});
      const version=(latest?.version??0)+1;
      const key=await tx.allocationKey.create({data:{
        tenantId:job.tenantId,displayKey:`AK-${dc.code}-${mode.code}-${String(version).padStart(3,'0')}`,version,
        dcId:dc.id,modeId:mode.id,status:'DRAFT',effectiveFrom:date(group.find((x:any)=>x.effectiveFrom)?.effectiveFrom),
        changeNote:String(overrides.changeNote??`Imported from ${job.filename}`),source:'import',supersedesId:active?.id,createdById:userId
      }});
      const seenCarrierScope=new Set<string>();
      for(const r of group){
        const carrier=await findCarrier(tx,job.tenantId,r.carrier); if(!carrier) throw new Error(`Unmatched carrier "${r.carrier}" on source row ${r.row}.`);
        const lane=await tx.lane.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,destinationCountry:r.destinationCountry,destinationRegion:r.destinationRegion}});
        if(!lane) throw new Error(`Unknown lane ${dc.code}/${mode.code}/${r.destinationCountry}-${r.destinationRegion} on row ${r.row}.`);
        const scope=[lane.id,r.destinationZip??'',r.customerCode??'',carrier.id].join('|');
        if(seenCarrierScope.has(scope)) throw new Error(`Carrier ${carrier.name} appears in more than one position for the same lane/customer/ZIP scope.`);
        seenCarrierScope.add(scope);
        await tx.allocationRule.create({data:{
          tenantId:job.tenantId,allocationKeyId:key.id,carrierId:carrier.id,laneId:lane.id,
          customerCode:r.customerCode,destinationZip:r.destinationZip,position:pos(r.allocationOrder),percentage:r.percentage,notes:r.notes
        }});
      }
      await tx.auditEvent.create({data:{tenantId:job.tenantId,userId,entityType:'AllocationKey',entityId:key.id,action:'IMPORT_DRAFT',summary:`Created Draft ${key.displayKey} from ${job.filename}`}});
      created.push(key.id);
    });
  }
  return {allocationKeyIds:created};
}

async function activeMappings(tx:Prisma.TransactionClient,tenantId:string,asOf:Date){
  return tx.postcodeMapping.findMany({where:{tenantId,OR:[{validFrom:null},{validFrom:{lte:asOf}}],AND:[{OR:[{validTo:null},{validTo:{gte:asOf}}]}]}});
}

function chooseMapping(country:string,postcode:string,mappings:any[]){
  const normalized=normalizePostcode(postcode);
  return mappings.filter(m=>m.countryCode===country&&normalized.startsWith(m.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0]??null;
}

async function commitVolumes(job:any,userId:string){
  const parsed=job.parsedData as any; const rows=parsed.rows as any[];
  return prisma.$transaction(async tx=>{
    const mappings=await activeMappings(tx,job.tenantId,new Date()); let unmapped=0;
    for(const r of rows){
      const dc=await findDc(tx,job.tenantId,r.dc); if(!dc) throw new Error(`Unknown DC ${r.dc} on row ${r.row}`);
      const mode=await findMode(tx,job.tenantId,r.mode); if(!mode) throw new Error(`Unknown mode ${r.mode} on row ${r.row}`);
      const mapping=chooseMapping(r.destinationCountry,r.normalizedPostcode,mappings);
      const lane=mapping?await tx.lane.findFirst({where:{tenantId:job.tenantId,dcId:dc.id,modeId:mode.id,destinationCountry:r.destinationCountry,destinationRegion:mapping.destinationRegion}}):null;
      if(!lane) unmapped++;
      await tx.volumeRecord.create({data:{
        tenantId:job.tenantId,importJobId:job.id,dcId:dc.id,modeId:mode.id,laneId:lane?.id,
        customerCode:r.customerCode,customerName:r.customerName,destinationCountry:r.destinationCountry,
        destinationPostcode:r.destinationPostcode,normalizedPostcode:r.normalizedPostcode,destinationRegion:mapping?.destinationRegion,
        shipmentCount:r.shipmentCount,palletCount:r.palletCount,averagePallets:r.averagePallets,
        shipmentPalletQuantities:r.shipmentPalletQuantities?json(r.shipmentPalletQuantities):undefined,period:r.period,
        forecastVolume:r.forecastVolume,notes:r.notes,mappedAt:lane?new Date():undefined
      }});
    }
    await tx.auditEvent.create({data:{tenantId:job.tenantId,userId,entityType:'VolumeRecord',action:'IMPORT',summary:`Imported ${rows.length} volume records from ${job.filename}`,details:json({unmapped})}});
    return {rows:rows.length,unmapped};
  });
}

async function commitPostcodes(job:any,userId:string){
  const parsed=job.parsedData as any; const rows=parsed.rows as any[];
  return prisma.$transaction(async tx=>{
    let versions=0;
    for(const r of rows){
      const validFrom=date(r.validFrom)??new Date();
      const previous=await tx.postcodeMapping.findFirst({
        where:{tenantId:job.tenantId,countryCode:r.countryCode,prefix:r.prefix,OR:[{validTo:null},{validTo:{gte:validFrom}}]},
        orderBy:{version:'desc'}
      });
      if(previous && previous.destinationRegion!==r.destinationRegion && !r.validFrom){
        throw new Error(`Conflicting mapping for ${r.countryCode} ${r.prefix}; provide Valid From to create a new version.`);
      }
      let laneId:string|undefined;
      if(r.laneIdentifier){
        const lane=await tx.lane.findFirst({where:{tenantId:job.tenantId,laneIdentifier:r.laneIdentifier}});
        laneId=lane?.id;
      }
      const version=(previous?.version??0)+1;
      const created=await tx.postcodeMapping.create({data:{
        tenantId:job.tenantId,countryCode:r.countryCode,prefix:r.prefix,destinationRegion:r.destinationRegion,laneId,
        validFrom,version,supersedesId:previous?.id,notes:r.notes,createdById:userId
      }});
      if(previous){
        await appendRevision(tx,job.tenantId,'PostcodeMapping',previous.id,previous,'SUPERSEDED',userId);
        const end=new Date(validFrom); end.setUTCDate(end.getUTCDate()-1);
        await tx.postcodeMapping.update({where:{id:previous.id},data:{validTo:end}});
        versions++;
      }
      await tx.auditEvent.create({data:{tenantId:job.tenantId,userId,entityType:'PostcodeMapping',entityId:created.id,action:'IMPORT',summary:`Imported mapping ${r.countryCode} ${r.prefix} -> ${r.destinationRegion}`}});
    }
    const mappings=await activeMappings(tx,job.tenantId,new Date());
    const volumes=await tx.volumeRecord.findMany({where:{tenantId:job.tenantId}});
    let changed=0,unmapped=0;
    for(const v of volumes){
      const mapping=chooseMapping(v.destinationCountry,v.normalizedPostcode,mappings);
      const lane=mapping?await tx.lane.findFirst({where:{tenantId:job.tenantId,dcId:v.dcId,modeId:v.modeId,destinationCountry:v.destinationCountry,destinationRegion:mapping.destinationRegion}}):null;
      if(v.destinationRegion!==mapping?.destinationRegion||v.laneId!==lane?.id){
        await appendRevision(tx,job.tenantId,'VolumeRecord',v.id,v,'POSTCODE_REMAP',userId);
        await tx.volumeRecord.update({where:{id:v.id},data:{destinationRegion:mapping?.destinationRegion,laneId:lane?.id??null,mappedAt:lane?new Date():null}});
        changed++;
      }
      if(!lane) unmapped++;
    }
    return {rows:rows.length,versionedMappings:versions,remappedVolumes:changed,unmappedVolumes:unmapped};
  });
}
