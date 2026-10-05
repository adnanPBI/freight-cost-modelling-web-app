import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { apiError, requireApiSession } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    await requireApiSession(req,true);
    await destroySession();
    return NextResponse.redirect(new URL('/login',req.url),303);
  }catch(error){return apiError(error);}
}
