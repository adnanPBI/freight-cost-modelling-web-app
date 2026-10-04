import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { applicableAllocationRules, costVolumeWithRate, validLaneRates } from './cost-engine';
import { createDraftFromActive, saveDraftRule } from './allocation';

const n=(v:any)=>v==null?0:Number(v);

async function targetCost(tenantId:string,volume:any,carrierId:string,asOf:Date,enablePalletToFtl:boolean,maxPalletsPerFtl:number){
  const rates=await validLaneRates({tenantId,laneId:volume.laneId,carrierId,asOf});
  const rate=rates.sort((a,b)=>b.rateCard.version-a.rateCard.version)[0];
  if(!rate) return {carrierId,total:0,missing:['Valid contracted rate']};
  const cost=await costVolumeWithRate({tenantId,volume,laneRate:rate,asOf,enablePalletToFtl,maxPalletsPerFtl});
  return {carrierId,total:cost.total,cost,missing:cost.missing};
}

export async function runScenario(args:{tenantId:string;scenarioId:string}){
  const scenario=await prisma.scenario.findFirst({where:{id:args.scenarioId,tenantId:args.tenantId},include:{rules:true}});
  if(!scenario) throw new Error('Scenario not found');
  const volumes=await prisma.volumeRecord.findMany({where:{tenantId:args.tenantId,laneId:{not:null}},include:{lane:true,dc:true,mode:true}});
  const rows:any[]=[]; let baselineTotal=0,scenarioTotal=0,convertedShipments=0,convertedPallets=0;
  for(const volume of volumes){
    const baseline=await applicableAllocationRules({tenantId:args.tenantId,volume,asOf:scenario.modellingDate});
    const primary=baseline.rules.find(r=>r.position==='PRIMARY')??baseline.rules[0];
    let baselineCost=0;
    if(primary){
      const b=await targetCost(args.tenantId,volume,primary.carrierId,scenario.modellingDate,false,scenario.maxPalletsPerFtl);
      baselineCost=b.total;
    }
    baselineTotal+=baselineCost;
    const customerAssign=scenario.rules.find(r=>r.laneId===volume.laneId&&r.customerCode===volume.customerCode&&r.type==='CUSTOMER_ASSIGNMENT');
    const customerSplit=scenario.rules.filter(r=>r.laneId===volume.laneId&&r.customerCode===volume.customerCode&&r.type==='CUSTOMER_SPLIT');
    const laneSplit=scenario.rules.filter(r=>r.laneId===volume.laneId&&r.type==='LANE_SPLIT'&&!r.customerCode);
    const replace=scenario.rules.find(r=>r.laneId===volume.laneId&&r.type==='CARRIER_REPLACEMENT'&&(!r.carrierId||r.carrierId===primary?.carrierId));
    let targets:{carrierId:string;percentage:number}[]=[];
    if(customerAssign&&(customerAssign.replacementCarrierId||customerAssign.carrierId)) targets=[{carrierId:(customerAssign.replacementCarrierId??customerAssign.carrierId)!,percentage:100}];
    else if(customerSplit.length) targets=customerSplit.filter(r=>r.replacementCarrierId||r.carrierId).map(r=>({carrierId:(r.replacementCarrierId??r.carrierId)!,percentage:n(r.percentage)}));
    else if(laneSplit.length) targets=laneSplit.filter(r=>r.replacementCarrierId||r.carrierId).map(r=>({carrierId:(r.replacementCarrierId??r.carrierId)!,percentage:n(r.percentage)}));
    else if(replace?.replacementCarrierId) targets=[{carrierId:replace.replacementCarrierId,percentage:100}];
    else if(primary) targets=[{carrierId:primary.carrierId,percentage:100}];
    const pct=targets.reduce((s,t)=>s+t.percentage,0);
    if(targets.length&&Math.abs(pct-100)>0.01) throw new Error(`Scenario split for ${volume.lane?.laneIdentifier??volume.laneId} / ${volume.customerCode} totals ${pct}%`);
    let scenarioCost=0; const carriers:string[]=[]; const missing:string[]=[];
    for(const target of targets){
      const c=await targetCost(args.tenantId,volume,target.carrierId,scenario.modellingDate,scenario.enablePalletToFtl,scenario.maxPalletsPerFtl);
      scenarioCost+=c.total*(target.percentage/100);carriers.push(target.carrierId);missing.push(...c.missing);
      convertedShipments+=(c.cost?.convertedShipments??0)*(target.percentage/100);
      convertedPallets+=(c.cost?.convertedPallets??0)*(target.percentage/100);
    }
    scenarioTotal+=scenarioCost;
    rows.push({volumeId:volume.id,customerCode:volume.customerCode,dc:volume.dc.code,mode:volume.mode.code,lane:volume.lane?.laneIdentifier,baselineCarrierId:primary?.carrierId??null,scenarioCarrierIds:carriers,baselineCost,scenarioCost,change:scenarioCost-baselineCost,changePct:baselineCost?((scenarioCost-baselineCost)/baselineCost)*100:null,missing:[...new Set(missing)]});
  }
  return {scenario,rows,summary:{baselineCost:baselineTotal,scenarioCost:scenarioTotal,change:scenarioTotal-baselineTotal,changePct:baselineTotal?((scenarioTotal-baselineTotal)/baselineTotal)*100:null,convertedShipments,convertedPallets}};
}

export async function createScenario(args:{tenantId:string;userId:string;name:string;description?:string;modellingDate:Date;enablePalletToFtl?:boolean;maxPalletsPerFtl?:number}){
  return prisma.scenario.create({data:{tenantId:args.tenantId,name:args.name,description:args.description,modellingDate:args.modellingDate,enablePalletToFtl:args.enablePalletToFtl??false,maxPalletsPerFtl:args.maxPalletsPerFtl??33,createdById:args.userId}});
}

export async function addScenarioRule(args:{tenantId:string;scenarioId:string;type:any;laneId:string;carrierId?:string;replacementCarrierId?:string;customerCode?:string;percentage?:number;notes?:string}){
  const scenario=await prisma.scenario.findFirst({where:{id:args.scenarioId,tenantId:args.tenantId}});if(!scenario) throw new Error('Scenario not found');
  return prisma.scenarioRule.create({data:{tenantId:args.tenantId,scenarioId:args.scenarioId,type:args.type,laneId:args.laneId,carrierId:args.carrierId,replacementCarrierId:args.replacementCarrierId,customerCode:args.customerCode,percentage:args.percentage,notes:args.notes}});
}

export async function promoteScenario(args:{tenantId:string;userId:string;scenarioId:string;merge:boolean}){
  const scenario=await prisma.scenario.findFirst({where:{id:args.scenarioId,tenantId:args.tenantId},include:{rules:{include:{lane:true}}}});
  if(!scenario) throw new Error('Scenario not found');
  const groups=new Map<string,typeof scenario.rules>();
  for(const r of scenario.rules){const key=r.lane.dcId+'|'+r.lane.modeId;groups.set(key,[...(groups.get(key)??[]),r]);}
  const keys:string[]=[];
  for(const rules of groups.values()){
    const dcId=rules[0].lane.dcId,modeId=rules[0].lane.modeId;
    const existing=await prisma.allocationKey.findFirst({where:{tenantId:args.tenantId,dcId,modeId,status:'DRAFT'}});
    if(existing&&!args.merge) throw new Error('A Draft already exists for this scope. Choose merge explicitly or remove the Draft first.');
    const draft=existing??await createDraftFromActive({tenantId:args.tenantId,userId:args.userId,dcId,modeId,changeNote:`Promoted from scenario ${scenario.name}`,source:`scenario:${scenario.id}`});
    for(const rule of rules){
      if(rule.type==='CARRIER_REPLACEMENT'&&rule.replacementCarrierId){
        const matches=await prisma.allocationRule.findMany({where:{tenantId:args.tenantId,allocationKeyId:draft.id,laneId:rule.laneId,...(rule.carrierId?{carrierId:rule.carrierId}:{})}});
        for(const m of matches) await saveDraftRule({tenantId:args.tenantId,userId:args.userId,keyId:draft.id,laneId:m.laneId,carrierId:rule.replacementCarrierId,position:m.position,percentage:m.percentage?Number(m.percentage):null,customerCode:m.customerCode,destinationZip:m.destinationZip,notes:`Scenario ${scenario.name}`});
      }else if((rule.type==='CUSTOMER_ASSIGNMENT'||rule.type==='CUSTOMER_SPLIT'||rule.type==='LANE_SPLIT')&&(rule.replacementCarrierId||rule.carrierId)){
        const siblings=rules.filter(x=>x.type===rule.type&&x.laneId===rule.laneId&&(x.customerCode??'')===(rule.customerCode??''));
        const index=siblings.findIndex(x=>x.id===rule.id);
        const positions=['PRIMARY','SECONDARY','TERTIARY','BACKUP_1','BACKUP_2'] as const;
        await saveDraftRule({tenantId:args.tenantId,userId:args.userId,keyId:draft.id,laneId:rule.laneId,carrierId:(rule.replacementCarrierId??rule.carrierId)!,position:positions[Math.min(index,4)],percentage:rule.percentage?Number(rule.percentage):siblings.length===1?100:undefined,customerCode:rule.customerCode,notes:`Scenario ${scenario.name}`});
      }
    }
    keys.push(draft.id);
  }
  if(keys.length) await prisma.scenario.update({where:{id:scenario.id},data:{promotedAllocationKeyId:keys[0]}});
  return {allocationKeyIds:keys};
}
