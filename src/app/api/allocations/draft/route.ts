import { NextResponse } from 'next/server';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { createDraftFromActive, removeDraftRule, saveDraftRule } from '@/lib/allocation';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const s=await requireApiSession(req,true); const f=await req.formData(); const action=String(f.get('action')||'create');
    let result:any;
    if(action==='create') result=await createDraftFromActive({tenantId:s.tenantId,userId:s.id,dcId:String(f.get('dcId')||''),modeId:String(f.get('modeId')||''),changeNote:String(f.get('changeNote')||'')||undefined});
    else if(action==='saveRule') result=await saveDraftRule({tenantId:s.tenantId,userId:s.id,keyId:String(f.get('keyId')||''),laneId:String(f.get('laneId')||''),carrierId:String(f.get('carrierId')||''),position:String(f.get('position')||'PRIMARY') as any,percentage:f.get('percentage')?Number(f.get('percentage')):null,customerCode:String(f.get('customerCode')||'')||null,destinationZip:String(f.get('destinationZip')||'')||null,notes:String(f.get('notes')||'')||null});
    else if(action==='removeRule'){await removeDraftRule({tenantId:s.tenantId,userId:s.id,ruleId:String(f.get('ruleId')||'')});result={ok:true};}
    else throw new Error('Unknown draft action');
    if(wantsJson(req))return NextResponse.json(result);return redirect303('/allocations');
  }catch(e){return apiError(e);}
}
