import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(){
  try{
    await prisma.$queryRawUnsafe('SELECT 1');
    return NextResponse.json({status:'ready'});
  }catch{
    return NextResponse.json({status:'not-ready',database:'unavailable'},{status:503});
  }
}
