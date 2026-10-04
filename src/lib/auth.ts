import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export type SessionUser = { id:string; tenantId:string; email:string; name:string; role:string };

function authSecret(){
  const value=process.env.AUTH_SECRET;
  if(!value || value.length<32){
    if(process.env.NODE_ENV==='production') throw new Error('AUTH_SECRET must be at least 32 characters');
    return 'dev-only-change-this-secret-32-characters';
  }
  return value;
}

export async function hashPassword(value:string){ return bcrypt.hash(value,12); }
export async function verifyPassword(value:string,hash:string){ return bcrypt.compare(value,hash); }

export async function createSession(user:SessionUser){
  const secret=new TextEncoder().encode(authSecret());
  const token=await new SignJWT(user).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('12h').sign(secret);
  const jar=await cookies();
  jar.set('freight_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:43200});
}

export async function destroySession(){
  const jar=await cookies();
  jar.set('freight_session','',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax'});
}

export async function getSession():Promise<SessionUser|null>{
  try{
    const token=(await cookies()).get('freight_session')?.value;
    if(!token) return null;
    const secret=new TextEncoder().encode(authSecret());
    const {payload}=await jwtVerify(token,secret);
    return payload as unknown as SessionUser;
  }catch{return null;}
}

export async function authenticate(email:string,password:string,tenantId?:string){
  const normalized=email.trim().toLowerCase();
  const users=await prisma.user.findMany({where:{email:normalized,active:true,...(tenantId?{tenantId}:{})},take:2});
  if(users.length!==1) return null;
  const user=users[0];
  if(!(await verifyPassword(password,user.passwordHash))) return null;
  return {id:user.id,tenantId:user.tenantId,email:user.email,name:user.name,role:user.role};
}
