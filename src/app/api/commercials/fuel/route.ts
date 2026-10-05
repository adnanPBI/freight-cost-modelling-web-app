import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true); const f=await req.formData();
    const carrierId=String(f.get('carrierId')||''),percentage=Number(f.get('percentage')),validFrom=new Date(String(f.get('validFrom')||'')),validTo=new Date(String(f.get('validTo')||''));
    if(!carrierId||!Number.isFinite(percentage)||Number.isNaN(+validFrom)||Number.isNaN(+validTo))throw new Error('Carrier, percentage and validity dates are required.');
    const carrier=await prisma.carrier.findFirst({where:{id:carrierId,tenantId:session.tenantId}});if(!carrier)throw new Error('Carrier not found');
    const scope={dcId:String(f.get('dcId')||'')||null,modeId:String(f.get('modeId')||'')||null,laneId:String(f.get('laneId')||'')||null,rateCardId:String(f.get('rateCardId')||'')||null};
    const latest=await prisma.fuelSurcharge.findFirst({where:{tenantId:session.tenantId,carrierId,...scope},orderBy:{version:'desc'}});
    const row=await prisma.fuelSurcharge.create({data:{tenantId:session.tenantId,carrierId,percentage,validFrom,validTo,...scope,version:(latest?.version??0)+1,supersedesId:latest?.id,notes:String(f.get('notes')||'')||undefined,createdById:session.id}});
    if(wantsJson(req))return NextResponse.json(row);return NextResponse.redirect(new URL('/commercials',req.url),303);
  }catch(e){return apiError(e);}
}
