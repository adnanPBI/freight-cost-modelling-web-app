import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appendRevision } from '@/lib/history';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const s=await requireApiSession(req,true);const f=await req.formData();const id=String(f.get('id')||'');const raw=String(f.get('accessorialAssumptions')||'{}');
    let assumptions:any;try{assumptions=JSON.parse(raw);}catch{throw new Error('Accessorial assumptions must be valid JSON, e.g. {"WAIT":2}.');}
    const result=await prisma.$transaction(async tx=>{const current=await tx.volumeRecord.findFirst({where:{id,tenantId:s.tenantId}});if(!current)throw new Error('Volume record not found');await appendRevision(tx,s.tenantId,'VolumeRecord',current.id,current,'ACCESSORIAL_ASSUMPTIONS',s.id);return tx.volumeRecord.update({where:{id},data:{accessorialAssumptions:assumptions}});});
    if(wantsJson(req))return NextResponse.json(result);return redirect303('/volumes?id='+id);
  }catch(e){return apiError(e);}
}
