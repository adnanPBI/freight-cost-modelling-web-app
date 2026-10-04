import { PrismaClient, CommercialStatus, RateCardStatus, AllocationKeyStatus } from '@prisma/client'; import bcrypt from 'bcryptjs';
const p=new PrismaClient();
async function main(){
  const tenant=await p.tenant.upsert({where:{id:'tenant_pantheras'},update:{},create:{id:'tenant_pantheras',name:'Pantheras Global Limited'}});
  const pw=await bcrypt.hash('ChangeMe!2026',12); await p.user.upsert({where:{tenantId_email:{tenantId:tenant.id,email:'admin@example.com'}},update:{},create:{tenantId:tenant.id,email:'admin@example.com',name:'MVP Admin',passwordHash:pw,role:'ADMIN'}});
  const dcs=[['CZ','Czech Republic','CZ'],['FR','France','FR'],['UK','United Kingdom','GB'],['PL','Poland','PL'],['IT','Italy','IT'],['ES','Spain','ES'],['GR','Greece','GR'],['TR','Turkey','TR'],['ZA','South Africa','ZA']];
  for(const [code,name,countryCode] of dcs) await p.distributionCentre.upsert({where:{tenantId_code:{tenantId:tenant.id,code}},update:{},create:{tenantId:tenant.id,code,name,countryCode}});
  for(const [code,name,palletBand] of [['FTL','Full Truck Load',false],['PALLET','Pallet',true],['LTL-PALLET','Direct LTL/Pallet',true],['PARCEL','Parcel',false]] as const) await p.transportMode.upsert({where:{tenantId_code:{tenantId:tenant.id,code}},update:{},create:{tenantId:tenant.id,code,name,palletBand}});
  for(let i=1;i<=7;i++) await p.carrier.upsert({where:{tenantId_code:{tenantId:tenant.id,code:`CARRIER${i}`}},update:{},create:{tenantId:tenant.id,code:`CARRIER${i}`,name:`Carrier ${i} Name`}});
  console.log('Seeded. Login admin@example.com / ChangeMe!2026 (change immediately).');
}
main().finally(()=>p.$disconnect());
