import { NextResponse } from 'next/server';
import { commitImport } from '@/lib/imports';
import { apiError, requireApiSession, wantsJson } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const session=await requireApiSession(req,true);
    const form=await req.formData();
    const jobId=String(form.get('jobId')||'');
    if(!jobId) throw new Error('Import job ID is required.');
    const keys=['carrier','dc','mode','validFrom','validTo','commercialStatus','currency','notes','supersedePrevious','replaceDraft','changeNote'];
    const overrides:Record<string,unknown>={};
    for(const key of keys){const v=form.get(key);if(v!==null&&String(v)!=='')overrides[key]=String(v);}
    const result=await commitImport({tenantId:session.tenantId,userId:session.id,jobId,overrides});
    if(wantsJson(req)) return NextResponse.json(result);
    return NextResponse.redirect(new URL('/imports?job='+jobId+'&committed=1',req.url),303);
  }catch(error){return apiError(error);}
}
