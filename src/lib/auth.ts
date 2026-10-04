import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-change-this-secret-32chars');
export type SessionUser = { id:string; tenantId:string; email:string; name:string; role:string };

export async function hashPassword(v:string){ return bcrypt.hash(v,12); }
export async function verifyPassword(v:string,h:string){ return bcrypt.compare(v,h); }

export async function createSession(user:SessionUser){
  const token = await new SignJWT(user).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('12h').sign(secret);
  const jar = await cookies();
  jar.set('crap_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:43200});
}

export async function destroySession(){
  const jar=await cookies();
  jar.set('crap_session','',{path:'/',maxAge:0});
}

export async function getSession():Promise<SessionUser|null>{
  try {
    const token=(await cookies()).get('crap_session')?.value;
    if(!token) return null;
    const {payload}=await jwtVerify(token,secret);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function authenticate(email:string,password:string){
  const normalizedEmail=email.toLowerCase().trim();
  const bootstrapEmail=process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();
  const bootstrapPassword=process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if(bootstrapEmail && bootstrapPassword && normalizedEmail===bootstrapEmail && password===bootstrapPassword){
    return {
      id:'render-bootstrap-admin',
      tenantId:'tenant_pantheras',
      email:normalizedEmail,
      name:'Pantheras MVP Admin',
      role:'ADMIN'
    };
  }

  try {
    const user=await prisma.user.findFirst({where:{email:normalizedEmail,active:true}});
    if(!user || !(await verifyPassword(password,user.passwordHash))) return null;
    return {id:user.id,tenantId:user.tenantId,email:user.email,name:user.name,role:user.role};
  } catch {
    return null;
  }
}
