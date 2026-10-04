import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(){
  let database='ok';
  try{await prisma.$queryRawUnsafe('SELECT 1');}catch{database='unavailable';}
  return NextResponse.json({status:'ok',database,commit:process.env.RENDER_GIT_COMMIT??null},{headers:{'Cache-Control':'no-store'}});
}
