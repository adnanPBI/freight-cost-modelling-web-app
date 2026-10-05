import { NextResponse } from 'next/server';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { addScenarioRule, createScenario, promoteScenario, runScenario } from '@/lib/scenario';
import { redirect303 } from '@/lib/public-url';

export async function GET(req:Request){
  try{const s=await requireApiSession(req);const id=new URL(req.url).searchParams.get('id');if(!id)throw new Error('id required');return NextResponse.json(await runScenario({tenantId:s.tenantId,scenarioId:id}));}catch(e){return apiError(e);}
}
export async function POST(req:Request){
  try{
    const s=await requireApiSession(req,true);const f=await req.formData();const action=String(f.get('action')||'create');let result:any;
    if(action==='create')result=await createScenario({tenantId:s.tenantId,userId:s.id,name:String(f.get('name')||''),description:String(f.get('description')||'')||undefined,modellingDate:new Date(String(f.get('modellingDate')||new Date().toISOString())),enablePalletToFtl:String(f.get('enablePalletToFtl')||'')==='on',maxPalletsPerFtl:Number(f.get('maxPalletsPerFtl')||33)});
    else if(action==='rule')result=await addScenarioRule({tenantId:s.tenantId,scenarioId:String(f.get('scenarioId')||''),type:String(f.get('type')||'CARRIER_REPLACEMENT') as any,laneId:String(f.get('laneId')||''),carrierId:String(f.get('carrierId')||'')||undefined,replacementCarrierId:String(f.get('replacementCarrierId')||'')||undefined,customerCode:String(f.get('customerCode')||'')||undefined,percentage:f.get('percentage')?Number(f.get('percentage')):undefined,notes:String(f.get('notes')||'')||undefined});
    else if(action==='promote')result=await promoteScenario({tenantId:s.tenantId,userId:s.id,scenarioId:String(f.get('scenarioId')||''),merge:String(f.get('merge')||'')==='true'});
    else throw new Error('Unknown scenario action');
    if(wantsJson(req))return NextResponse.json(result);return redirect303('/scenarios'+(result?.id?'?id='+result.id:''));
  }catch(e){return apiError(e);}
}
