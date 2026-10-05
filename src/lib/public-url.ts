export function redirect303(path:string){
  if(!path.startsWith('/')) throw new Error('Redirect path must be relative');
  return new Response(null,{
    status:303,
    headers:{
      Location:path,
      'Cache-Control':'no-store'
    }
  });
}

export function publicUrl(req:Request,path:string){
  const configured=(process.env.APP_BASE_URL||'').trim().replace(/\/$/,'');
  if(configured) return new URL(path,configured+'/');
  const forwardedHost=(req.headers.get('x-forwarded-host')||'').split(',')[0].trim();
  const host=forwardedHost||req.headers.get('host')||'';
  const forwardedProto=(req.headers.get('x-forwarded-proto')||'').split(',')[0].trim();
  const proto=forwardedProto||'https';
  if(host) return new URL(path,`${proto}://${host}`);
  return new URL(path,req.url);
}
