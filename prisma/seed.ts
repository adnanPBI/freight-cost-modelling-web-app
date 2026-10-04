import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma=new PrismaClient();

async function main(){
  const tenantId=process.env.SEED_TENANT_ID?.trim()||'tenant_pantheras';
  const tenantName=process.env.SEED_TENANT_NAME?.trim()||'Pantheras Global Limited';
  const tenant=await prisma.tenant.upsert({where:{id:tenantId},update:{name:tenantName},create:{id:tenantId,name:tenantName}});
  await prisma.tenantConfig.upsert({where:{tenantId:tenant.id},update:{},create:{tenantId:tenant.id}});

  const dcs=[
    ['CZ','Czech Republic','CZ',['CZDC']],['FR','France','FR',['FRDC']],['UK','United Kingdom','GB',['UKDC']],
    ['PL','Poland','PL',['PLDC']],['IT','Italy','IT',['ITDC']],['ES','Spain','ES',['ESDC']],
    ['GR','Greece','GR',['GRDC']],['TR','Turkey','TR',['TRDC']],['ZA','South Africa','ZA',['ZADC']]
  ] as const;
  for(const [code,name,countryCode,aliases] of dcs){
    await prisma.distributionCentre.upsert({
      where:{tenantId_code:{tenantId:tenant.id,code}},
      update:{name,countryCode,aliases:[...aliases]},
      create:{tenantId:tenant.id,code,name,countryCode,aliases:[...aliases]}
    });
  }

  const modes=[['FTL','Full Truck Load',false],['PALLET','Pallet',true],['LTL-PALLET','Direct LTL/Pallet',true],['PARCEL','Parcel',false]] as const;
  for(const [code,name,palletBand] of modes){
    await prisma.transportMode.upsert({where:{tenantId_code:{tenantId:tenant.id,code}},update:{name,palletBand},create:{tenantId:tenant.id,code,name,palletBand}});
  }

  const accessorialTypes=[
    ['WAITING_TIME','Waiting time','PER_HOUR'],['DEMURRAGE','Demurrage','PER_HOUR'],['CANCELLATION','Cancellation','FLAT'],
    ['PALLET_RETURN','Pallet return','PER_PALLET'],['SPECIAL_HANDLING','Special handling','PER_SHIPMENT'],['HAZARDOUS','Hazardous goods','PER_SHIPMENT']
  ] as const;
  for(const [code,name,defaultBasis] of accessorialTypes){
    await prisma.accessorialType.upsert({where:{tenantId_code:{tenantId:tenant.id,code}},update:{name,defaultBasis},create:{tenantId:tenant.id,code,name,defaultBasis}});
  }

  const email=process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password=process.env.SEED_ADMIN_PASSWORD;
  if(email&&password){
    if(password.length<12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
    const passwordHash=await bcrypt.hash(password,12);
    await prisma.user.upsert({
      where:{tenantId_email:{tenantId:tenant.id,email}},
      update:{passwordHash,name:process.env.SEED_ADMIN_NAME?.trim()||'Platform Admin',active:true,role:'ADMIN'},
      create:{tenantId:tenant.id,email,passwordHash,name:process.env.SEED_ADMIN_NAME?.trim()||'Platform Admin',role:'ADMIN'}
    });
  }else if(process.env.NODE_ENV==='production'){
    console.log('SEED_ADMIN_EMAIL/PASSWORD not set; master/config seed completed without creating a user.');
  }
  console.log('Idempotent tenant bootstrap complete.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
