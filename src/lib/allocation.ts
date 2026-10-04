import { prisma } from './prisma';
import { appendRevision } from './history';
import { aggregatedCostProfile } from './cost-engine';

export async function createDraftFromActive(args:{tenantId:string;userId:string;dcId:string;modeId:string;changeNote?:string;source?:string}){
  return prisma.$transaction(async tx=>{
    const existing=await tx.allocationKey.findFirst({where:{tenantId:args.tenantId,dcId:args.dcId,modeId:args.modeId,status:'DRAFT'}});
    if(existing) return existing;
    const active=await tx.allocationKey.findFirst({where:{tenantId:args.tenantId,dcId:args.dcId,modeId:args.modeId,status:'ACTIVE'},orderBy:{version:'desc'},include:{rules:true}});
    const latest=await tx.allocationKey.findFirst({where:{tenantId:args.tenantId,dcId:args.dcId,modeId:args.modeId},orderBy:{version:'desc'}});
    const dc=await tx.distributionCentre.findFirstOrThrow({where:{id:args.dcId,tenantId:args.tenantId}});
    const mode=await tx.transportMode.findFirstOrThrow({where:{id:args.modeId,tenantId:args.tenantId}});
    const version=(latest?.version??0)+1;
    const draft=await tx.allocationKey.create({data:{
      tenantId:args.tenantId,displayKey:`AK-${dc.code}-${mode.code}-${String(version).padStart(3,'0')}`,version,
      dcId:args.dcId,modeId:args.modeId,status:'DRAFT',supersedesId:active?.id,changeNote:args.changeNote,
      source:args.source??'manual',createdById:args.userId
    }});
    if(active) for(const r of active.rules) await tx.allocationRule.create({data:{
      tenantId:args.tenantId,allocationKeyId:draft.id,carrierId:r.carrierId,laneId:r.laneId,
      customerCode:r.customerCode,destinationZip:r.destinationZip,position:r.position,percentage:r.percentage,notes:r.notes
    }});
    return draft;
  });
}

export async function saveDraftRule(args:{
  tenantId:string;userId:string;keyId:string;laneId:string;carrierId:string;position:any;percentage?:number|null;
  customerCode?:string|null;destinationZip?:string|null;notes?:string|null
}){
  return prisma.$transaction(async tx=>{
    const key=await tx.allocationKey.findFirst({where:{id:args.keyId,tenantId:args.tenantId,status:'DRAFT'}});
    if(!key) throw new Error('Draft allocation key not found');
    const lane=await tx.lane.findFirst({where:{id:args.laneId,tenantId:args.tenantId}});
    const carrier=await tx.carrier.findFirst({where:{id:args.carrierId,tenantId:args.tenantId}});
    if(!lane||!carrier) throw new Error('Lane or carrier not found in this tenant');
    const existing=await tx.allocationRule.findFirst({where:{
      tenantId:args.tenantId,allocationKeyId:key.id,laneId:lane.id,position:args.position,
      customerCode:args.customerCode??null,destinationZip:args.destinationZip??null
    }});
    if(existing){
      await appendRevision(tx,args.tenantId,'AllocationRule',existing.id,existing,'UPDATE',args.userId);
      return tx.allocationRule.update({where:{id:existing.id},data:{carrierId:carrier.id,percentage:args.percentage,notes:args.notes}});
    }
    return tx.allocationRule.create({data:{
      tenantId:args.tenantId,allocationKeyId:key.id,laneId:lane.id,carrierId:carrier.id,position:args.position,
      percentage:args.percentage,customerCode:args.customerCode,destinationZip:args.destinationZip,notes:args.notes
    }});
  });
}

export async function removeDraftRule(args:{tenantId:string;userId:string;ruleId:string}){
  return prisma.$transaction(async tx=>{
    const rule=await tx.allocationRule.findFirst({where:{id:args.ruleId,tenantId:args.tenantId},include:{allocationKey:true}});
    if(!rule||rule.allocationKey.status!=='DRAFT') throw new Error('Draft rule not found');
    await appendRevision(tx,args.tenantId,'AllocationRule',rule.id,rule,'DELETE',args.userId);
    await tx.allocationRule.delete({where:{id:rule.id}});
  });
}

export async function compareAllocationKeys(tenantId:string,aId:string,bId:string,asOf=new Date()){
  const [aKey,bKey]=await Promise.all([
    prisma.allocationKey.findFirst({where:{id:aId,tenantId}}),
    prisma.allocationKey.findFirst({where:{id:bId,tenantId}})
  ]);
  if(!aKey||!bKey) throw new Error('Allocation key not found');
  const [a,b]=await Promise.all([
    prisma.allocationRule.findMany({where:{tenantId,allocationKeyId:aId},include:{carrier:true,lane:true}}),
    prisma.allocationRule.findMany({where:{tenantId,allocationKeyId:bId},include:{carrier:true,lane:true}})
  ]);
  const scope=(r:any)=>[r.laneId,r.customerCode??'',r.destinationZip??''].join('|');
  const exact=(r:any)=>[scope(r),r.position].join('|');
  const am=new Map(a.map(r=>[exact(r),r])); const bm=new Map(b.map(r=>[exact(r),r]));
  const keys=new Set([...am.keys(),...bm.keys()]);
  const changes:any[]=[];
  for(const key of keys){
    const from=am.get(key),to=bm.get(key); const any=to??from;
    if(!from) changes.push({change:'ADDED',lane:any?.lane.laneIdentifier??`${any?.lane.destinationCountry}-${any?.lane.destinationRegion}`,position:any?.position,fromCarrier:null,toCarrier:to?.carrier.name,fromPercentage:null,toPercentage:to?.percentage?.toString()??null,customerCode:to?.customerCode,destinationZip:to?.destinationZip});
    else if(!to) changes.push({change:'REMOVED',lane:from.lane.laneIdentifier??`${from.lane.destinationCountry}-${from.lane.destinationRegion}`,position:from.position,fromCarrier:from.carrier.name,toCarrier:null,fromPercentage:from.percentage?.toString()??null,toPercentage:null,customerCode:from.customerCode,destinationZip:from.destinationZip});
    else if(from.carrierId!==to.carrierId||String(from.percentage??'')!==String(to.percentage??'')) changes.push({change:'CHANGED',lane:to.lane.laneIdentifier??`${to.lane.destinationCountry}-${to.lane.destinationRegion}`,position:to.position,fromCarrier:from.carrier.name,toCarrier:to.carrier.name,fromPercentage:from.percentage?.toString()??null,toPercentage:to.percentage?.toString()??null,customerCode:to.customerCode,destinationZip:to.destinationZip});
  }
  const aByScope=new Map<string,any[]>(),bByScope=new Map<string,any[]>();
  for(const r of a) aByScope.set(scope(r),[...(aByScope.get(scope(r))??[]),r]);
  for(const r of b) bByScope.set(scope(r),[...(bByScope.get(scope(r))??[]),r]);
  for(const [s,fromRows] of aByScope){
    const toRows=bByScope.get(s)??[];
    for(const fr of fromRows){
      const moved=toRows.find(tr=>tr.carrierId===fr.carrierId&&tr.position!==fr.position);
      if(moved) changes.push({change:'MOVED',lane:moved.lane.laneIdentifier??`${moved.lane.destinationCountry}-${moved.lane.destinationRegion}`,carrier:moved.carrier.name,fromPosition:fr.position,toPosition:moved.position,customerCode:moved.customerCode,destinationZip:moved.destinationZip});
    }
  }
  const [aCost,bCost]=await Promise.all([
    aggregatedCostProfile({tenantId,asOf,keyId:aId}),
    aggregatedCostProfile({tenantId,asOf,keyId:bId})
  ]);
  return {from:aKey,to:bKey,changes,costImpact:{from:aCost.total,to:bCost.total,change:bCost.total-aCost.total,changePct:aCost.total?((bCost.total-aCost.total)/aCost.total)*100:null}};
}

export async function publishAllocationKey(tenantId:string,keyId:string,userId?:string){
  return prisma.$transaction(async tx=>{
    const draft=await tx.allocationKey.findFirst({where:{id:keyId,tenantId,status:'DRAFT'}});
    if(!draft) throw new Error('Draft allocation key not found');
    const active=await tx.allocationKey.findFirst({where:{tenantId,status:'ACTIVE',dcId:draft.dcId,modeId:draft.modeId}});
    const now=new Date();
    if(active){
      await appendRevision(tx,tenantId,'AllocationKey',active.id,active,'EXPIRE',userId);
      await tx.allocationKey.update({where:{id:active.id},data:{status:'EXPIRED',effectiveTo:now}});
    }
    const published=await tx.allocationKey.update({where:{id:draft.id},data:{status:'ACTIVE',effectiveFrom:draft.effectiveFrom??now}});
    await tx.auditEvent.create({data:{tenantId,userId,entityType:'AllocationKey',entityId:draft.id,action:'PUBLISH',summary:`Published ${draft.displayKey}`,details:{expiredKeyId:active?.id}}});
    return published;
  });
}
