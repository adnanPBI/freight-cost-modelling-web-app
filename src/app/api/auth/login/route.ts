import { NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const form=await req.formData();
    const email=String(form.get('email')||'').trim();
    const password=String(form.get('password')||'');
    const user=await authenticate(email,password);
    if(!user) return NextResponse.redirect(new URL('/login?error=1',req.url),303);
    await createSession(user);
    return NextResponse.redirect(new URL('/dashboard',req.url),303);
  }catch(error){
    console.error('Login unavailable',error);
    return NextResponse.redirect(new URL('/login?error=service',req.url),303);
  }
}
