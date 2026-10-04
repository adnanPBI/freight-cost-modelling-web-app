import { NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';

export async function POST(req:Request){
  const form=await req.formData();
  const email=String(form.get('email')||'').trim();
  const password=String(form.get('password')||'');
  const user=await authenticate(email,password);
  if(!user) return NextResponse.redirect(new URL('/login?error=1',req.url),303);
  await createSession(user);
  return NextResponse.redirect(new URL('/dashboard',req.url),303);
}
