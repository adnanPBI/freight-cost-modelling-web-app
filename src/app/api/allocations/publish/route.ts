import { NextResponse } from 'next/server';
import { publishAllocationKey } from '@/lib/allocation';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true);
    const contentType=req.headers.get('content-type')||'';
    let keyId='';
    if(contentType.includes('application/json')) keyId=String((await req.json()).keyId||'');
    else keyId=String((await req.formData()).get('keyId')||'');
    if(!keyId) throw new Error('Allocation key ID is required.');
    const result=await publishAllocationKey(session.tenantId,keyId,session.id);
    if(wantsJson(req)) return NextResponse.json(result);
    return redirect303('/allocations?key='+result.id);
  }catch(error){return apiError(error);}
}
