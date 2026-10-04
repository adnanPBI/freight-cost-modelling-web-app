import { CommercialStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { bandCost, breakEvenPalletQty, palletShipmentCost, roundPalletQty } from './costing';
import { tenantConfig } from './tenant';

export type CostResult={
  base:number;fuel:number;accessorials:number;total:number;fuelPct:number;
  missing:string[];warnings:string[];convertedShipments:number;convertedPallets:number;convertedSaving:number;
};

const n=(v:any)=>v===null||v===undefined?0:Number(v);
const asOfFilter=(asOf:Date)=>({validFrom:{lte:asOf},validTo:{gte:asOf}});

export async function validLaneRates(args:{
  tenantId:string;laneId:string;asOf:Date;includeResearch?:boolean;carrierId?:string
}){
  return prisma.laneRate.findMany({
    where:{
      tenantId:args.tenantId,laneId:args.laneId,
      ...(args.carrierId?{rateCard:{carrierId:args.carrierId}}:{}),
      rateCard:{
        tenantId:args.tenantId,...asOfFilter(args.asOf),status:{not:'SUPERSEDED'},
        ...(args.includeResearch?{commercialStatus:{in:['CONTRACTED_ACTIVE','SUBMISSION_RESEARCH'] as CommercialStatus[]}}:{commercialStatus:'CONTRACTED_ACTIVE'})
      }
    },
    include:{rateCard:{include:{carrier:true,mode:true}},bands:true,lane:{include:{dc:true,mode:true}}}
  });
}

async function fuelFor(args:{tenantId:string;carrierId:string;laneId:string;dcId:string;modeId:string;rateCardId:string;asOf:Date}){
  const rows=await prisma.fuelSurcharge.findMany({where:{
    tenantId:args.tenantId,carrierId:args.carrierId,...asOfFilter(args.asOf),
    OR:[
      {laneId:args.laneId},{rateCardId:args.rateCardId},
      {laneId:null,rateCardId:null,dcId:args.dcId,modeId:args.modeId},
      {laneId:null,rateCardId:null,dcId:args.dcId,modeId:null},
      {laneId:null,rateCardId:null,dcId:null,modeId:null}
    ]
  }});
  const score=(r:any)=>(r.laneId?16:0)+(r.rateCardId?8:0)+(r.dcId?4:0)+(r.modeId?2:0);
  return rows.sort((a,b)=>score(b)-score(a))[0]??null;
}

async function accessorialCost(args:{
  tenantId:string;carrierId:string;laneId:string;dcId:string;modeId:string;destinationCountry:string;
  rateCardId:string;asOf:Date;base:number;shipments:number;pallets:number;assumptions?:Record<string,number>
}){
  const assumptions=args.assumptions??{};
  const rows=await prisma.carrierAccessorial.findMany({where:{
    tenantId:args.tenantId,carrierId:args.carrierId,...asOfFilter(args.asOf),commercialStatus:'CONTRACTED_ACTIVE',
    OR:[
      {laneId:args.laneId},{rateCardId:args.rateCardId},
      {laneId:null,rateCardId:null,dcId:args.dcId,modeId:args.modeId,destinationCountry:args.destinationCountry},
      {laneId:null,rateCardId:null,dcId:args.dcId,modeId:args.modeId,destinationCountry:null},
      {laneId:null,rateCardId:null,dcId:args.dcId,modeId:null,destinationCountry:null},
      {laneId:null,rateCardId:null,dcId:null,modeId:null,destinationCountry:null}
    ]
  },include:{type:true}});
  const score=(r:any)=>(r.laneId?32:0)+(r.rateCardId?16:0)+(r.destinationCountry?8:0)+(r.dcId?4:0)+(r.modeId?2:0);
  const selected=new Map<string,typeof rows[number]>();
  for(const row of rows.sort((a,b)=>score(b)-score(a))) if(!selected.has(row.typeId)) selected.set(row.typeId,row);
  let total=0; const missing:string[]=[];
  for(const row of selected.values()){
    const units=assumptions[row.type.code];
    if(units===undefined) continue;
    const amount=n(row.amount);
    if(row.chargingBasis==='PER_SHIPMENT') total+=amount*units;
    else if(row.chargingBasis==='PER_PALLET') total+=amount*units;
    else if(row.chargingBasis==='PER_HOUR') total+=amount*units;
    else if(row.chargingBasis==='PERCENT_BASE') total+=args.base*(amount/100)*units;
    else total+=amount*units;
  }
  for(const code of Object.keys(assumptions)) if(![...selected.values()].some(r=>r.type.code===code)) missing.push(`Accessorial ${code}`);
  return {total,missing};
}

async function ftlFallbackRate(args:{tenantId:string;carrierId:string;lane:any;asOf:Date}){
  const ftlLane=await prisma.lane.findFirst({where:{
    tenantId:args.tenantId,dcId:args.lane.dcId,destinationCountry:args.lane.destinationCountry,
    destinationRegion:args.lane.destinationRegion,mode:{code:'FTL'}
  }});
  if(!ftlLane) return null;
  const rates=await validLaneRates({tenantId:args.tenantId,laneId:ftlLane.id,asOf:args.asOf,carrierId:args.carrierId});
  return rates.sort((a,b)=>n(a.baseRate)-n(b.baseRate))[0]??null;
}

export async function costVolumeWithRate(args:{
  tenantId:string;volume:any;laneRate:any;asOf:Date;enablePalletToFtl?:boolean;maxPalletsPerFtl?:number
}):Promise<CostResult>{
  const cfg=await tenantConfig(args.tenantId);
  const mode=args.laneRate.rateCard.mode.code;
  const shipments=n(args.volume.shipmentCount);
  const pallets=n(args.volume.palletCount);
  let base=0,convertedShipments=0,convertedPallets=0,convertedSaving=0;
  const missing:string[]=[]; const warnings:string[]=[];
  if(mode==='FTL'){
    if(args.laneRate.baseRate==null) missing.push('Base rate');
    else base=shipments*n(args.laneRate.baseRate);
  }else{
    const bands=Object.fromEntries(args.laneRate.bands.map((b:any)=>[b.palletQty,n(b.rate)])) as Record<number,number>;
    const quantities=Array.isArray(args.volume.shipmentPalletQuantities)?args.volume.shipmentPalletQuantities as number[]:null;
    let ftl=await ftlFallbackRate({tenantId:args.tenantId,carrierId:args.laneRate.rateCard.carrierId,lane:args.laneRate.lane,asOf:args.asOf});
    const ftlRate=ftl?.baseRate==null?undefined:n(ftl.baseRate);
    const costOne=(q:number)=>{
      try{return palletShipmentCost(q,bands,{rounding:cfg.palletRounding,above36:cfg.above36Policy,ftlRate,maxPalletsPerFtl:args.maxPalletsPerFtl??cfg.maxPalletsPerFtl});}
      catch(e){missing.push(e instanceof Error?e.message:'Pallet cost unavailable');return 0;}
    };
    if(quantities?.length){
      for(const raw of quantities){
        if(!Number.isFinite(raw)||raw<=0){warnings.push('Invalid pallet quantity excluded');continue;}
        const palletCost=costOne(raw);
        let chosen=palletCost;
        if(args.enablePalletToFtl&&ftlRate!==undefined){
          const trips=Math.ceil(roundPalletQty(raw,cfg.palletRounding)/(args.maxPalletsPerFtl??cfg.maxPalletsPerFtl));
          const ftlCost=trips*ftlRate;
          if(ftlCost<palletCost){chosen=ftlCost;convertedShipments++;convertedPallets+=raw;convertedSaving+=palletCost-ftlCost;}
        }
        base+=chosen;
      }
      if(quantities.length!==Math.round(shipments)) warnings.push('Shipment-level pallet quantities do not equal aggregated shipment count; shipment-level list was used where supplied.');
    }else{
      const avg=args.volume.averagePallets==null?undefined:n(args.volume.averagePallets);
      if(!avg||avg<=0) missing.push('Average pallets per shipment');
      else{
        const palletCost=costOne(avg);
        let chosen=palletCost;
        if(args.enablePalletToFtl&&ftlRate!==undefined){
          const trips=Math.ceil(roundPalletQty(avg,cfg.palletRounding)/(args.maxPalletsPerFtl??cfg.maxPalletsPerFtl));
          const ftlCost=trips*ftlRate;
          if(ftlCost<palletCost){chosen=ftlCost;convertedShipments=shipments;convertedPallets=pallets||shipments*avg;convertedSaving=(palletCost-ftlCost)*shipments;}
        }
        base=chosen*shipments;
      }
    }
  }
  const fuelRow=await fuelFor({
    tenantId:args.tenantId,carrierId:args.laneRate.rateCard.carrierId,laneId:args.laneRate.laneId,
    dcId:args.laneRate.lane.dcId,modeId:args.laneRate.lane.modeId,rateCardId:args.laneRate.rateCardId,asOf:args.asOf
  });
  const fuelPct=fuelRow?n(fuelRow.percentage):0;
  if(!fuelRow&&cfg.requireFuelForCosting) missing.push('Fuel surcharge');
  const fuel=base*fuelPct/100;
  const assumptions=(args.volume.accessorialAssumptions??{}) as Record<string,number>;
  const access=await accessorialCost({
    tenantId:args.tenantId,carrierId:args.laneRate.rateCard.carrierId,laneId:args.laneRate.laneId,
    dcId:args.laneRate.lane.dcId,modeId:args.laneRate.lane.modeId,destinationCountry:args.laneRate.lane.destinationCountry,
    rateCardId:args.laneRate.rateCardId,asOf:args.asOf,base,shipments,pallets,assumptions
  });
  missing.push(...access.missing);
  return {base,fuel,accessorials:access.total,total:base+fuel+access.total,fuelPct,missing:[...new Set(missing)],warnings:[...new Set(warnings)],convertedShipments,convertedPallets,convertedSaving};
}

function zipMatch(ruleZip:string|null,postcode:string){
  if(!ruleZip) return true;
  const z=ruleZip.replace(/\s+/g,'').toUpperCase();
  if(/^0+$/.test(z)) return true;
  const prefix=z.replace(/0+$/,'');
  return postcode.startsWith(prefix.length>=3?prefix:z);
}

export async function applicableAllocationRules(args:{tenantId:string;volume:any;asOf:Date;keyId?:string}){
  const key=args.keyId
    ? await prisma.allocationKey.findFirst({where:{id:args.keyId,tenantId:args.tenantId}})
    : await prisma.allocationKey.findFirst({where:{
        tenantId:args.tenantId,status:'ACTIVE',dcId:args.volume.dcId,modeId:args.volume.modeId,
        OR:[{effectiveFrom:null},{effectiveFrom:{lte:args.asOf}}],AND:[{OR:[{effectiveTo:null},{effectiveTo:{gte:args.asOf}}]}]
      },orderBy:{version:'desc'}});
  if(!key||!args.volume.laneId) return {key:null,rules:[]};
  const rules=await prisma.allocationRule.findMany({where:{tenantId:args.tenantId,allocationKeyId:key.id,laneId:args.volume.laneId},include:{carrier:true}});
  const matches=rules.filter(r=>(!r.customerCode||r.customerCode===args.volume.customerCode)&&zipMatch(r.destinationZip,args.volume.normalizedPostcode));
  const score=(r:any)=>(r.customerCode?100:0)+(r.destinationZip&&!/^0+$/.test(r.destinationZip)?50:0);
  const max=matches.reduce((m,r)=>Math.max(m,score(r)),-1);
  return {key,rules:matches.filter(r=>score(r)===max).sort((a,b)=>['PRIMARY','SECONDARY','TERTIARY','BACKUP_1','BACKUP_2'].indexOf(a.position)-['PRIMARY','SECONDARY','TERTIARY','BACKUP_1','BACKUP_2'].indexOf(b.position))};
}

export async function costProfileForVolume(args:{tenantId:string;volume:any;asOf:Date;keyId?:string;enablePalletToFtl?:boolean}){
  const allocation=await applicableAllocationRules(args);
  const results:any[]=[];
  for(const rule of allocation.rules){
    const rates=await validLaneRates({tenantId:args.tenantId,laneId:args.volume.laneId,asOf:args.asOf,carrierId:rule.carrierId});
    const selected=rates.sort((a,b)=>b.rateCard.version-a.rateCard.version)[0];
    if(!selected){
      results.push({position:rule.position,carrier:rule.carrier,percentage:n(rule.percentage)||100,cost:null,missing:['Valid contracted rate']});
      continue;
    }
    const cost=await costVolumeWithRate({tenantId:args.tenantId,volume:args.volume,laneRate:selected,asOf:args.asOf,enablePalletToFtl:args.enablePalletToFtl});
    results.push({position:rule.position,carrier:rule.carrier,percentage:n(rule.percentage)||100,rateCard:selected.rateCard,cost});
  }
  return {allocationKey:allocation.key,results};
}

export async function laneAlternatives(args:{
  tenantId:string;dcId?:string;modeId?:string;destinationCountry?:string;destinationRegion?:string;carrierId?:string;
  asOf:Date;includeResearch?:boolean;customerCode?:string
}){
  const lanes=await prisma.lane.findMany({where:{
    tenantId:args.tenantId,active:true,
    ...(args.dcId?{dcId:args.dcId}:{}),...(args.modeId?{modeId:args.modeId}:{}),
    ...(args.destinationCountry?{destinationCountry:args.destinationCountry}:{}),...(args.destinationRegion?{destinationRegion:args.destinationRegion}:{})
  },include:{dc:true,mode:true}});
  const output:any[]=[];
  for(const lane of lanes){
    const rates=await validLaneRates({tenantId:args.tenantId,laneId:lane.id,asOf:args.asOf,includeResearch:args.includeResearch,carrierId:args.carrierId});
    const volumes=await prisma.volumeRecord.findMany({where:{tenantId:args.tenantId,laneId:lane.id,...(args.customerCode?{customerCode:args.customerCode}:{})}});
    for(const rate of rates){
      let total=0,base=0,fuel=0,accessorials=0; const missing=new Set<string>();
      for(const volume of volumes){
        const c=await costVolumeWithRate({tenantId:args.tenantId,volume,laneRate:rate,asOf:args.asOf});
        total+=c.total;base+=c.base;fuel+=c.fuel;accessorials+=c.accessorials;c.missing.forEach(x=>missing.add(x));
      }
      const activeKey=await prisma.allocationKey.findFirst({where:{tenantId:args.tenantId,status:'ACTIVE',dcId:lane.dcId,modeId:lane.modeId},orderBy:{version:'desc'}});
      const allocated=activeKey?await prisma.allocationRule.findFirst({where:{tenantId:args.tenantId,allocationKeyId:activeKey.id,laneId:lane.id,carrierId:rate.rateCard.carrierId,customerCode:null}}):null;
      output.push({lane,carrier:rate.rateCard.carrier,commercialStatus:rate.rateCard.commercialStatus,rateCardId:rate.rateCardId,position:allocated?.position??'UNALLOCATED',base,fuel,accessorials,total,missing:[...missing]});
    }
  }
  return output;
}

export async function palletBreakEven(args:{tenantId:string;laneId:string;carrierId:string;asOf:Date}){
  const lane=await prisma.lane.findFirst({where:{id:args.laneId,tenantId:args.tenantId},include:{mode:true}});
  if(!lane||lane.mode.code==='FTL') return null;
  const pallet=(await validLaneRates({tenantId:args.tenantId,laneId:lane.id,carrierId:args.carrierId,asOf:args.asOf}))[0];
  if(!pallet) return null;
  const ftl=await ftlFallbackRate({tenantId:args.tenantId,carrierId:args.carrierId,lane,asOf:args.asOf});
  if(!ftl?.baseRate) return {breakEven:null,reason:'No valid FTL rate'};
  const palletFuel=await fuelFor({tenantId:args.tenantId,carrierId:args.carrierId,laneId:lane.id,dcId:lane.dcId,modeId:lane.modeId,rateCardId:pallet.rateCardId,asOf:args.asOf});
  const ftlFuel=await fuelFor({tenantId:args.tenantId,carrierId:args.carrierId,laneId:ftl.laneId,dcId:ftl.lane.dcId,modeId:ftl.lane.modeId,rateCardId:ftl.rateCardId,asOf:args.asOf});
  const bands=Object.fromEntries(pallet.bands.map(b=>[b.palletQty,n(b.rate)]));
  return {breakEven:breakEvenPalletQty(bands,n(ftl.baseRate),n(palletFuel?.percentage),n(ftlFuel?.percentage)),ftlRate:n(ftl.baseRate)};
}

export async function aggregatedCostProfile(args:{tenantId:string;asOf:Date;keyId?:string;enablePalletToFtl?:boolean}){
  const volumes=await prisma.volumeRecord.findMany({where:{tenantId:args.tenantId},include:{dc:true,mode:true,lane:true}});
  const rows:any[]=[]; let grand=0;
  for(const volume of volumes){
    if(!volume.laneId){rows.push({volumeId:volume.id,customerCode:volume.customerCode,dc:volume.dc.code,mode:volume.mode.code,lane:'UNMAPPED',missing:['Lane mapping']});continue;}
    const profile=await costProfileForVolume({tenantId:args.tenantId,volume,asOf:args.asOf,keyId:args.keyId,enablePalletToFtl:args.enablePalletToFtl});
    const primary=profile.results.find((x:any)=>x.position==='PRIMARY')??profile.results[0];
    grand+=primary?.cost?.total??0;
    rows.push({volumeId:volume.id,customerCode:volume.customerCode,customerName:volume.customerName,dc:volume.dc.code,mode:volume.mode.code,lane:volume.lane?.laneIdentifier??`${volume.destinationCountry}-${volume.destinationRegion}`,carrier:primary?.carrier?.name??null,position:primary?.position??null,base:primary?.cost?.base??0,fuel:primary?.cost?.fuel??0,accessorials:primary?.cost?.accessorials??0,total:primary?.cost?.total??0,missing:primary?.missing??primary?.cost?.missing??['No allocation']});
  }
  return {total:grand,rows};
}
