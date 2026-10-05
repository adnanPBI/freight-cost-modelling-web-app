import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appendRevision } from '@/lib/history';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const s=await requireApiSession(req,true); const f=await req.formData(); const action=String(f.get('action')||'config'); let result:any;
    if(action==='dc'){
      const id=String(f.get('id')||''),code=String(f.get('code')||'').trim().toUpperCase(),name=String(f.get('name')||'').trim(),countryCode=String(f.get('countryCode')||'').trim().toUpperCase(),aliases=String(f.get('aliases')||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean);
      if(!code||!name||countryCode.length!==2)throw new Error('DC code, name and 2-character country code are required.');
      if(id){result=await prisma.$transaction(async tx=>{const current=await tx.distributionCentre.findFirst({where:{id,tenantId:s.tenantId}});if(!current)throw new Error('DC not found');await appendRevision(tx,s.tenantId,'DistributionCentre',current.id,current,'UPDATE',s.id);return tx.distributionCentre.update({where:{id},data:{code,name,countryCode,aliases}});});}
      else result=await prisma.distributionCentre.create({data:{tenantId:s.tenantId,code,name,countryCode,aliases}});
    }else if(action==='mode'){
      const id=String(f.get('id')||''),code=String(f.get('code')||'').trim().toUpperCase(),name=String(f.get('name')||'').trim(),palletBand=String(f.get('palletBand')||'')==='on';
      if(!code||!name)throw new Error('Mode code and name are required.');
      if(id){result=await prisma.$transaction(async tx=>{const current=await tx.transportMode.findFirst({where:{id,tenantId:s.tenantId}});if(!current)throw new Error('Mode not found');await appendRevision(tx,s.tenantId,'TransportMode',current.id,current,'UPDATE',s.id);return tx.transportMode.update({where:{id},data:{code,name,palletBand}});});}
      else result=await prisma.transportMode.create({data:{tenantId:s.tenantId,code,name,palletBand}});
    }else{
      const cfg=await prisma.tenantConfig.upsert({where:{tenantId:s.tenantId},create:{tenantId:s.tenantId},update:{}});
      await appendRevision(prisma as any,s.tenantId,'TenantConfig',cfg.id,cfg,'UPDATE',s.id);
      result=await prisma.tenantConfig.update({where:{tenantId:s.tenantId},data:{
        palletRounding:String(f.get('palletRounding')||'UP') as any,above36Policy:String(f.get('above36Policy')||'FTL') as any,
        maxPalletsPerFtl:Number(f.get('maxPalletsPerFtl')||33),minContractedCarriers:Number(f.get('minContractedCarriers')||2),
        defaultExpiryHorizonDays:Number(f.get('defaultExpiryHorizonDays')||90),requireFuelForCosting:String(f.get('requireFuelForCosting')||'')==='on'
      }});
    }
    if(wantsJson(req))return NextResponse.json(result);return NextResponse.redirect(new URL('/settings',req.url),303);
  }catch(e){return apiError(e);}
}
