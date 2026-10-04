import { NextResponse } from 'next/server';
import { compareAllocationKeys } from '@/lib/allocation';
import { apiError, requireApiSession } from '@/lib/http';

export async function GET(req:Request){
  try{
    const session=await requireApiSession(req);
    const u=new URL(req.url);
    const a=u.searchParams.get('a'),b=u.searchParams.get('b');
    if(!a||!b) throw new Error('a and b are required.');
    const asOf=new Date(u.searchParams.get('asOf')||Date.now());
    return NextResponse.json(await compareAllocationKeys(session.tenantId,a,b,asOf));
  }catch(error){return apiError(error);}
}
