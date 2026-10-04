import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { apiError, requireApiSession } from '@/lib/http';

export async function POST(req:Request){
  try{
    await requireApiSession(req,true);
    await destroySession();
    return NextResponse.redirect(new URL('/login',req.url),303);
  }catch(error){return apiError(error);}
}
