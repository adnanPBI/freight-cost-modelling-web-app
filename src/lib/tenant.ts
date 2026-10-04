import { getSession, type SessionUser } from './auth';
import { prisma } from './prisma';

export async function requireSession():Promise<SessionUser>{
  const session=await getSession();
  if(!session) throw new Error('UNAUTHORIZED');
  return session;
}

export function assertTenantRecord<T extends {tenantId:string}>(tenantId:string,record:T|null|undefined):T{
  if(!record || record.tenantId!==tenantId) throw new Error('NOT_FOUND');
  return record;
}

export function assertEUR(value:unknown){
  if(value===undefined || value===null || value==='' || String(value).toUpperCase()==='EUR') return 'EUR' as const;
  throw new Error('Only EUR is supported in the MVP');
}

export function assertSameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin) return;
  const host=req.headers.get('x-forwarded-host') || req.headers.get('host');
  if(!host) return;
  const expected=(req.headers.get('x-forwarded-proto') || 'https')+'://'+host;
  if(origin!==expected) throw new Error('INVALID_ORIGIN');
}

export async function tenantConfig(tenantId:string){
  return prisma.tenantConfig.upsert({
    where:{tenantId},
    update:{},
    create:{tenantId}
  });
}
