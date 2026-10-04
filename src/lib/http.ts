import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { assertSameOrigin } from './tenant';

export class HttpError extends Error{
  constructor(public status:number,message:string){super(message);}
}

export async function requireApiSession(req?:Request,mutating=false){
  const session=await getSession();
  if(!session) throw new HttpError(401,'Unauthorized');
  if(mutating&&req){
    try{assertSameOrigin(req);}catch{throw new HttpError(403,'Invalid request origin');}
  }
  return session;
}

export function apiError(error:unknown){
  if(error instanceof HttpError) return NextResponse.json({error:error.message},{status:error.status});
  const message=error instanceof Error?error.message:'Unexpected error';
  if(message==='UNAUTHORIZED') return NextResponse.json({error:'Unauthorized'},{status:401});
  if(message==='NOT_FOUND') return NextResponse.json({error:'Not found'},{status:404});
  if(message==='INVALID_ORIGIN') return NextResponse.json({error:'Invalid request origin'},{status:403});
  return NextResponse.json({error:message},{status:400});
}

export function wantsJson(req:Request){
  return (req.headers.get('accept')||'').includes('application/json');
}
