import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true); const f=await req.formData(); const action=String(f.get('action')||'agreement');
    if(action==='type'){
      const code=String(f.get('code')||'').trim().toUpperCase(),name=String(f.get('name')||'').trim(),defaultBasis=String(f.get('defaultBasis')||'PER_SHIPMENT') as any;
      if(!code||!name)throw new Error('Accessorial code and name are required.');
      const row=await prisma.accessorialType.create({data:{tenantId:session.tenantId,code,name,defaultBasis,description:String(f.get('description')||'')||undefined}});
      if(wantsJson(req))return NextResponse.json(row);return redirect303('/commercials');
    }
    const carrierId=String(f.get('carrierId')||''),typeId=String(f.get('typeId')||''),amount=Number(f.get('amount')),chargingBasis=String(f.get('chargingBasis')||'PER_SHIPMENT') as any;
    const validFrom=new Date(String(f.get('validFrom')||'')),validTo=new Date(String(f.get('validTo')||''));
    if(!carrierId||!typeId||!Number.isFinite(amount)||Number.isNaN(+validFrom)||Number.isNaN(+validTo))throw new Error('Carrier, accessorial type, amount and dates are required.');
    const scope={dcId:String(f.get('dcId')||'')||null,modeId:String(f.get('modeId')||'')||null,laneId:String(f.get('laneId')||'')||null,rateCardId:String(f.get('rateCardId')||'')||null,destinationCountry:String(f.get('destinationCountry')||'').toUpperCase()||null};
    const latest=await prisma.carrierAccessorial.findFirst({where:{tenantId:session.tenantId,carrierId,typeId,...scope},orderBy:{version:'desc'}});
    const row=await prisma.carrierAccessorial.create({data:{tenantId:session.tenantId,carrierId,typeId,amount,currency:'EUR',chargingBasis,validFrom,validTo,commercialStatus:'CONTRACTED_ACTIVE',...scope,version:(latest?.version??0)+1,supersedesId:latest?.id,notes:String(f.get('notes')||'')||undefined,createdById:session.id}});
    if(wantsJson(req))return NextResponse.json(row);return redirect303('/commercials');
  }catch(e){return apiError(e);}
}
