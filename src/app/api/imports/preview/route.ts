import { NextResponse } from 'next/server';
import { ImportType } from '@prisma/client';
import { previewImport } from '@/lib/imports';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';

const MAX_UPLOAD=10*1024*1024;
const typeMap:Record<string,ImportType>={rate:'RATE_CARD',allocation:'ALLOCATION_KEY',volume:'VOLUME',postcode:'POSTCODE_MAPPING'};

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true);
    const form=await req.formData();
    const file=form.get('file');
    const type=typeMap[String(form.get('type')||'')];
    if(!type) throw new Error('Choose a supported import type.');
    if(!(file instanceof File)) throw new Error('An .xlsx file is required.');
    if(file.size<=0||file.size>MAX_UPLOAD) throw new Error('Workbook must be between 1 byte and 10 MB.');
    if(!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Only .xlsx workbooks are accepted.');
    const allowed=['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream',''];
    if(file.type&&!allowed.includes(file.type)) throw new Error('Unexpected upload MIME type.');
    const modeValue=String(form.get('modeOverride')||'').toUpperCase();
    const modeOverride=(['FTL','PALLET','LTL-PALLET'].includes(modeValue)?modeValue:undefined) as any;
    const buffer=Buffer.from(await file.arrayBuffer());
    const job=await previewImport({tenantId:session.tenantId,userId:session.id,type,filename:file.name,buffer,modeOverride});
    if(wantsJson(req)) return NextResponse.json({jobId:job.id,issues:job.issues,preview:job.parsed,duplicateOf:job.duplicateOf});
    return NextResponse.redirect(new URL('/imports?job='+job.id,req.url),303);
  }catch(error){return apiError(error);}
}
