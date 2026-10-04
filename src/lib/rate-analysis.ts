import { prisma } from './prisma';
import { costVolumeWithRate } from './cost-engine';

const n=(v:any)=>v==null?0:Number(v);

export async function compareRateCards(args:{tenantId:string;fromId:string;toId:string;asOf?:Date}){
  const [from,to]=await Promise.all([
    prisma.rateCard.findFirst({where:{id:args.fromId,tenantId:args.tenantId},include:{carrier:true,dc:true,mode:true,rates:{include:{lane:true,bands:true}}}}),
    prisma.rateCard.findFirst({where:{id:args.toId,tenantId:args.tenantId},include:{carrier:true,dc:true,mode:true,rates:{include:{lane:true,bands:true}}}})
  ]);
  if(!from||!to) throw new Error('Rate card not found');
  const fm=new Map(from.rates.map(r=>[r.laneId,r])); const tm=new Map(to.rates.map(r=>[r.laneId,r]));
  const ids=new Set([...fm.keys(),...tm.keys()]); const rows:any[]=[]; let fromAnnual=0,toAnnual=0;
  for(const laneId of ids){
    const a=fm.get(laneId),b=tm.get(laneId),lane=(b??a)!.lane;
    const volumes=await prisma.volumeRecord.findMany({where:{tenantId:args.tenantId,laneId}});
    let oldCost=0,newCost=0;
    for(const volume of volumes){
      if(a){
        const ca=await costVolumeWithRate({tenantId:args.tenantId,volume,laneRate:{...a,rateCard:from,lane,bands:a.bands},asOf:args.asOf??to.validFrom});
        oldCost+=ca.total;
      }
      if(b){
        const cb=await costVolumeWithRate({tenantId:args.tenantId,volume,laneRate:{...b,rateCard:to,lane,bands:b.bands},asOf:args.asOf??to.validFrom});
        newCost+=cb.total;
      }
    }
    fromAnnual+=oldCost;toAnnual+=newCost;
    if(from.mode.code==='FTL'&&to.mode.code==='FTL'){
      const oldRate=a?.baseRate==null?null:n(a.baseRate),newRate=b?.baseRate==null?null:n(b.baseRate);
      rows.push({lane:lane.laneIdentifier??`${lane.destinationCountry}-${lane.destinationRegion}`,destinationCountry:lane.destinationCountry,status:!a?'ADDED':!b?'REMOVED':'UNCHANGED',band:null,oldRate,newRate,change:oldRate!=null&&newRate!=null?newRate-oldRate:null,changePct:oldRate?((newRate!-oldRate)/oldRate)*100:null,oldAnnualCost:oldCost,newAnnualCost:newCost,annualImpact:newCost-oldCost});
    }else{
      const ab=new Map((a?.bands??[]).map(x=>[x.palletQty,n(x.rate)])); const bb=new Map((b?.bands??[]).map(x=>[x.palletQty,n(x.rate)]));
      for(let q=1;q<=36;q++){
        const oldRate=ab.get(q)??null,newRate=bb.get(q)??null;
        rows.push({lane:lane.laneIdentifier??`${lane.destinationCountry}-${lane.destinationRegion}`,destinationCountry:lane.destinationCountry,status:!a?'ADDED':!b?'REMOVED':'UNCHANGED',band:q,oldRate,newRate,change:oldRate!=null&&newRate!=null?newRate-oldRate:null,changePct:oldRate?((newRate!-oldRate)/oldRate)*100:null,oldAnnualCost:oldCost,newAnnualCost:newCost,annualImpact:newCost-oldCost});
      }
    }
  }
  return {from,to,rows,summary:{oldAnnualCost:fromAnnual,newAnnualCost:toAnnual,annualImpact:toAnnual-fromAnnual,weightedPct:fromAnnual?((toAnnual-fromAnnual)/fromAnnual)*100:null}};
}
