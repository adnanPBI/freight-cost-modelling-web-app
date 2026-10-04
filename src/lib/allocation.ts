import { prisma } from './prisma';
export async function publishAllocationKey(tenantId:string,keyId:string,userId?:string){
  return prisma.$transaction(async tx=>{
    const draft=await tx.allocationKey.findFirst({where:{id:keyId,tenantId,status:'DRAFT'}}); if(!draft) throw new Error('Draft allocation key not found');
    const active=await tx.allocationKey.findFirst({where:{tenantId,status:'ACTIVE',dcId:draft.dcId,modeId:draft.modeId}});
    const now=new Date(); if(active) await tx.allocationKey.update({where:{id:active.id},data:{status:'EXPIRED',effectiveTo:now}});
    const published=await tx.allocationKey.update({where:{id:draft.id},data:{status:'ACTIVE',effectiveFrom:draft.effectiveFrom??now}});
    await tx.auditEvent.create({data:{tenantId,userId,entityType:'AllocationKey',entityId:draft.id,action:'PUBLISH',summary:`Published ${draft.displayKey}`,details:{expiredKeyId:active?.id}}});
    return published;
  });
}
export async function compareAllocationKeys(tenantId:string,aId:string,bId:string){
  const [a,b]=await Promise.all([
    prisma.allocationRule.findMany({where:{allocationKey:{id:aId,tenantId}},include:{carrier:true,lane:true}}),
    prisma.allocationRule.findMany({where:{allocationKey:{id:bId,tenantId}},include:{carrier:true,lane:true}})
  ]);
  const key=(r:any)=>[r.laneId,r.customerCode??'',r.destinationZip??'',r.position].join('|'); const am=new Map(a.map(r=>[key(r),r])); const bm=new Map(b.map(r=>[key(r),r])); const keys=new Set([...am.keys(),...bm.keys()]);
  return [...keys].map(k=>{const x=am.get(k),y=bm.get(k); return {key:k,lane:(y??x)?.lane.destinationCountry+'-'+(y??x)?.lane.destinationRegion,position:(y??x)?.position,fromCarrier:x?.carrier.name??null,toCarrier:y?.carrier.name??null,fromPercentage:x?.percentage?.toString()??null,toPercentage:y?.percentage?.toString()??null,changed:x?.carrierId!==y?.carrierId||String(x?.percentage??'')!==String(y?.percentage??'')}}).filter(x=>x.changed);
}
