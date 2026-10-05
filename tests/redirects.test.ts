import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { redirect303 } from '../src/lib/public-url';

function routeFiles(dir:string):string[]{
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) return routeFiles(full);
    return entry.isFile() && entry.name==='route.ts' ? [full] : [];
  });
}

describe('reverse-proxy-safe redirects',()=>{
  it('emits a relative Location header',()=>{
    const response=redirect303('/dashboard');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.get('location')).not.toContain('0.0.0.0');
  });

  it('never derives form redirects from req.url',()=>{
    const files=routeFiles(path.join(process.cwd(),'src','app','api'));
    for(const file of files){
      const source=fs.readFileSync(file,'utf8');
      expect(source, file).not.toContain('NextResponse.redirect(new URL(');
      expect(source, file).not.toContain("new URL('/dashboard',req.url)");
      expect(source, file).not.toContain("new URL('/login',req.url)");
    }
  });
});
