import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appendRevision } from '@/lib/history';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { publicUrl } from '@/lib/public-url';

export async function GET(req:Request){
  try{
    const session=await requireApiSession(req);
    const rows=await prisma.carrier.findMany({where:{tenantId:session.tenantId},include:{aliases:true,_count:{select:{rateCards:true,allocations:true}}},orderBy:{name:'asc'}});
    return NextResponse.json(rows);
  }catch(e){return apiError(e);}
}

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true); const form=await req.formData();
    const id=String(form.get('id')||''); const code=String(form.get('code')||'').trim().toUpperCase(); const name=String(form.get('name')||'').trim();
    const aliases=String(form.get('aliases')||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean); const notes=String(form.get('notes')||'').trim()||undefined;
    if(!code||!name) throw new Error('Carrier code and name are required.');
    const result=await prisma.$transaction(async tx=>{
      if(id){
        const current=await tx.carrier.findFirst({where:{id,tenantId:session.tenantId},include:{aliases:true}});if(!current)throw new Error('Carrier not found');
        await appendRevision(tx,session.tenantId,'Carrier',current.id,current,'UPDATE',session.id);
        const updated=await tx.carrier.update({where:{id:current.id},data:{code,name,notes}});
        await tx.carrierAlias.deleteMany({where:{tenantId:session.tenantId,carrierId:current.id}});
        for(const alias of aliases) await tx.carrierAlias.create({data:{tenantId:session.tenantId,carrierId:current.id,alias}});
        return updated;
      }
      const created=await tx.carrier.create({data:{tenantId:session.tenantId,code,name,notes}});
      for(const alias of aliases) await tx.carrierAlias.create({data:{tenantId:session.tenantId,carrierId:created.id,alias}});
      await tx.auditEvent.create({data:{tenantId:session.tenantId,userId:session.id,entityType:'Carrier',entityId:created.id,action:'CREATE',summary:`Created carrier ${name}`}});
      return created;
    });
    if(wantsJson(req))return NextResponse.json(result);return NextResponse.redirect(new URL('/carriers',req.url),303);
  }catch(e){return apiError(e);}
}

export async function DELETE(req:Request){
  try{
    const session=await requireApiSession(req,true); const id=new URL(req.url).searchParams.get('id'); if(!id)throw new Error('id required');
    await prisma.$transaction(async tx=>{const current=await tx.carrier.findFirst({where:{id,tenantId:session.tenantId}});if(!current)throw new Error('Carrier not found');await appendRevision(tx,session.tenantId,'Carrier',current.id,current,'DEACTIVATE',session.id);await tx.carrier.update({where:{id},data:{active:false}});});
    return NextResponse.json({ok:true});
  }catch(e){return apiError(e);}
}
