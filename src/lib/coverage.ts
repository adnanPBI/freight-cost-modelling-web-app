import { prisma } from './prisma';
import { tenantConfig } from './tenant';
import { validLaneRates } from './cost-engine';

export type CoverageRow={issue:string;severity:'HIGH'|'MEDIUM'|'REVIEW';lane?:string;carrier?:string;dc?:string;mode?:string;country?:string;volume:number;risk?:number;details:string};

const n=(v:any)=>v==null?0:Number(v);

export async function coverageGaps(args:{tenantId:string;asOf?:Date;expiryDays?:number;dcId?:string;modeId?:string;country?:string;carrierId?:string}){
  const asOf=args.asOf??new Date(); const cfg=await tenantConfig(args.tenantId); const horizon=args.expiryDays??cfg.defaultExpiryHorizonDays;
  const until=new Date(asOf); until.setUTCDate(until.getUTCDate()+horizon);
  const volumes=await prisma.volumeRecord.findMany({where:{
    tenantId:args.tenantId,...(args.dcId?{dcId:args.dcId}:{}),...(args.modeId?{modeId:args.modeId}:{}),...(args.country?{destinationCountry:args.country}:{})
  },include:{dc:true,mode:true,lane:true}});
  const rows:CoverageRow[]=[];
  for(const v of volumes){
    const volume=n(v.shipmentCount);
    if(!v.laneId||!v.lane){rows.push({issue:'Unmapped volume',severity:'HIGH',dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:`${v.customerCode} / ${v.normalizedPostcode} cannot be mapped to a lane`});continue;}
    const laneLabel=v.lane.laneIdentifier??`${v.lane.destinationCountry}-${v.lane.destinationRegion}`;
    const key=await prisma.allocationKey.findFirst({where:{
      tenantId:args.tenantId,status:'ACTIVE',dcId:v.dcId,modeId:v.modeId,
      OR:[{effectiveFrom:null},{effectiveFrom:{lte:asOf}}],AND:[{OR:[{effectiveTo:null},{effectiveTo:{gte:asOf}}]}]
    },orderBy:{version:'desc'}});
    const rules=key?await prisma.allocationRule.findMany({where:{tenantId:args.tenantId,allocationKeyId:key.id,laneId:v.laneId,customerCode:null},include:{carrier:true}}):[];
    const primary=rules.find(r=>r.position==='PRIMARY'); const backup=rules.find(r=>r.position==='BACKUP_1');
    if(!primary) rows.push({issue:'No Primary carrier',severity:'HIGH',lane:laneLabel,dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:'Lane has demand but no general Primary allocation'});
    if(!backup) rows.push({issue:'No Backup 1 carrier',severity:'MEDIUM',lane:laneLabel,dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:'Lane has demand but no Backup 1 allocation'});
    const alternatives=await validLaneRates({tenantId:args.tenantId,laneId:v.laneId,asOf});
    const distinct=new Set(alternatives.map(x=>x.rateCard.carrierId));
    if(distinct.size<cfg.minContractedCarriers) rows.push({issue:'Low contracted carrier coverage',severity:'MEDIUM',lane:laneLabel,dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:`Only ${distinct.size} active contracted carrier(s), threshold ${cfg.minContractedCarriers}`});
    for(const rule of rules){
      if(args.carrierId&&rule.carrierId!==args.carrierId) continue;
      const valid=await validLaneRates({tenantId:args.tenantId,laneId:v.laneId,carrierId:rule.carrierId,asOf});
      if(!valid.length) rows.push({issue:'Allocation has no valid contracted rate',severity:'HIGH',lane:laneLabel,carrier:rule.carrier.name,dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:`${rule.position} allocation is operational but no contracted rate is valid on selected date`});
      const expiring=await prisma.rateCard.findFirst({where:{
        tenantId:args.tenantId,carrierId:rule.carrierId,commercialStatus:'CONTRACTED_ACTIVE',validFrom:{lte:asOf},validTo:{gte:asOf,lte:until},
        rates:{some:{laneId:v.laneId}}
      },orderBy:{validTo:'asc'}});
      if(expiring) rows.push({issue:`Rate expires within ${horizon} days`,severity:'REVIEW',lane:laneLabel,carrier:rule.carrier.name,dc:v.dc.code,mode:v.mode.code,country:v.destinationCountry,volume,details:`Valid To ${expiring.validTo.toISOString().slice(0,10)}`});
    }
  }
  const dedup=new Map<string,CoverageRow>();
  for(const row of rows){const key=[row.issue,row.lane,row.carrier,row.details].join('|');const old=dedup.get(key);if(old) old.volume+=row.volume;else dedup.set(key,{...row});}
  return [...dedup.values()].sort((a,b)=>({HIGH:3,MEDIUM:2,REVIEW:1}[b.severity]-{HIGH:3,MEDIUM:2,REVIEW:1}[a.severity])||b.volume-a.volume);
}
