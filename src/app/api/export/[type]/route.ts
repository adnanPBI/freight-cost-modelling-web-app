import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiSession } from '@/lib/http';
import { makeExport, allocationExportRows, mappingExportRows } from '@/lib/exports';
import { coverageGaps } from '@/lib/coverage';
import { laneAlternatives, aggregatedCostProfile } from '@/lib/cost-engine';
import { compareAllocationKeys } from '@/lib/allocation';
import { compareRateCards } from '@/lib/rate-analysis';
import { runScenario } from '@/lib/scenario';

export async function GET(req:Request,{params}:{params:Promise<{type:string}>}){
  const session=await requireApiSession(req); const {type}=await params; const u=new URL(req.url);
  const asOf=new Date(u.searchParams.get('asOf')||Date.now()); const filters=u.searchParams.toString();
  let sheets:{name:string;rows:Record<string,unknown>[]}[]=[]; let reference=type;
  if(type==='allocations'){
    const keyId=u.searchParams.get('keyId');
    const key=await prisma.allocationKey.findFirst({where:{tenantId:session.tenantId,...(keyId?{id:keyId}:{status:'ACTIVE'})},orderBy:{version:'desc'},include:{rules:{include:{carrier:true,lane:true}},dc:true,mode:true}});
    if(!key)return NextResponse.json({error:'Allocation key not found'},{status:404});
    sheets=[{name:'Allocation Key',rows:allocationExportRows(key)}];reference=key.displayKey;
  }else if(type==='allocation-comparison'){
    const a=u.searchParams.get('a'),b=u.searchParams.get('b');if(!a||!b)return NextResponse.json({error:'a and b required'},{status:400});
    const result=await compareAllocationKeys(session.tenantId,a,b,asOf);sheets=[{name:'Key Comparison',rows:result.changes},{name:'Cost Impact',rows:[result.costImpact]}];reference=`${result.from.displayKey} vs ${result.to.displayKey}`;
  }else if(type==='lanes'){
    const rows=await laneAlternatives({tenantId:session.tenantId,asOf,dcId:u.searchParams.get('dcId')||undefined,modeId:u.searchParams.get('modeId')||undefined,destinationCountry:u.searchParams.get('country')||undefined,destinationRegion:u.searchParams.get('region')||undefined,carrierId:u.searchParams.get('carrierId')||undefined,includeResearch:u.searchParams.get('research')==='1'});
    sheets=[{name:'Lane Comparison',rows:rows.map((r:any)=>({DC:r.lane.dc.code,Mode:r.lane.mode.code,Lane:r.lane.laneIdentifier??`${r.lane.destinationCountry}-${r.lane.destinationRegion}`,Carrier:r.carrier.name,CommercialStatus:r.commercialStatus,Allocation:r.position,Base:r.base,Fuel:r.fuel,Accessorials:r.accessorials,Total:r.total,Missing:r.missing.join('; ')}))}];
  }else if(type==='rate-cards'){
    const cards=await prisma.rateCard.findMany({where:{tenantId:session.tenantId},include:{carrier:true,dc:true,mode:true,_count:{select:{rates:true}}},orderBy:{createdAt:'desc'}});
    sheets=[{name:'Rate Cards',rows:cards.map(c=>({ID:c.id,Carrier:c.carrier.name,DC:c.dc.code,Mode:c.mode.code,Currency:c.currency,ValidFrom:c.validFrom.toISOString().slice(0,10),ValidTo:c.validTo.toISOString().slice(0,10),CommercialStatus:c.commercialStatus,Status:c.status,Version:c.version,Filename:c.originalFilename,Lanes:c._count.rates}))}];
  }else if(type==='rate-change'){
    const fromId=u.searchParams.get('from'),toId=u.searchParams.get('to');if(!fromId||!toId)return NextResponse.json({error:'from and to required'},{status:400});
    const result=await compareRateCards({tenantId:session.tenantId,fromId,toId,asOf});sheets=[{name:'Rate Change',rows:result.rows},{name:'Summary',rows:[result.summary]}];reference=`${result.from.id} vs ${result.to.id}`;
  }else if(type==='volumes'){
    const rows=await prisma.volumeRecord.findMany({where:{tenantId:session.tenantId},include:{dc:true,mode:true,lane:true},orderBy:{createdAt:'desc'}});
    sheets=[{name:'Volumes Master',rows:rows.map(r=>({DC:r.dc.code,Mode:r.mode.code,CustomerCode:r.customerCode,CustomerName:r.customerName,DestinationCountry:r.destinationCountry,Postcode:r.destinationPostcode,NormalizedPostcode:r.normalizedPostcode,DestinationRegion:r.destinationRegion??'',Lane:r.lane?.laneIdentifier??'',ShipmentCount:Number(r.shipmentCount),PalletCount:r.palletCount==null?'':Number(r.palletCount),AveragePallets:r.averagePallets==null?'':Number(r.averagePallets),ShipmentPalletQuantities:r.shipmentPalletQuantities??'',Period:r.period,ForecastVolume:r.forecastVolume==null?'':Number(r.forecastVolume),Notes:r.notes??''}))}];
  }else if(type==='cost-profiles'){
    const result=await aggregatedCostProfile({tenantId:session.tenantId,asOf,enablePalletToFtl:u.searchParams.get('convert')==='1'});sheets=[{name:'Cost Profiles',rows:result.rows},{name:'Summary',rows:[{TotalModelledCost:result.total}]}];
  }else if(type==='scenarios'){
    const id=u.searchParams.get('id');if(!id)return NextResponse.json({error:'scenario id required'},{status:400});
    const result=await runScenario({tenantId:session.tenantId,scenarioId:id});sheets=[{name:'Scenario Results',rows:result.rows},{name:'Scenario Summary',rows:[result.summary]}];reference=result.scenario.name;
  }else if(type==='coverage'){
    const rows=await coverageGaps({tenantId:session.tenantId,asOf,expiryDays:Number(u.searchParams.get('expiryDays')||90),dcId:u.searchParams.get('dcId')||undefined,modeId:u.searchParams.get('modeId')||undefined,country:u.searchParams.get('country')||undefined,carrierId:u.searchParams.get('carrierId')||undefined});sheets=[{name:'Coverage Gaps',rows}];
  }else if(type==='postcode-mappings'){
    const rows=await prisma.postcodeMapping.findMany({where:{tenantId:session.tenantId},include:{lane:true},orderBy:[{countryCode:'asc'},{prefix:'asc'},{version:'desc'}]});sheets=[{name:'Postcode Mapping',rows:mappingExportRows(rows)}];
  }else return NextResponse.json({error:'Unknown export type'},{status:404});
  const buffer=await makeExport(sheets,{user:session.email,reference,filters});
  return new NextResponse(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${type}.xlsx"`,'Cache-Control':'no-store'}});
}
