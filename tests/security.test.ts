import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}

describe('business API security',()=>{
  it('requires authentication for every business route',()=>{
    const routes=walk('src/app/api').filter(p=>p.endsWith('route.ts'));
    const exempt=['/auth/login/','/health/','/readiness/'];
    for(const file of routes){
      const normalized=file.replaceAll('\\','/');
      if(exempt.some(x=>normalized.includes(x)))continue;
      const source=fs.readFileSync(file,'utf8');
      expect(source.includes('requireApiSession')||source.includes('requireSession'),file).toBe(true);
    }
  });
  it('applies same-origin validation to mutating business routes',()=>{
    const routes=walk('src/app/api').filter(p=>p.endsWith('route.ts'));
    for(const file of routes){
      const normalized=file.replaceAll('\\','/');
      if(normalized.includes('/auth/login/')||normalized.includes('/health/')||normalized.includes('/readiness/'))continue;
      const source=fs.readFileSync(file,'utf8');
      const mutating=/export async function (POST|PUT|PATCH|DELETE)/.test(source);
      if(mutating)expect(source.includes('requireApiSession(req,true)'),file).toBe(true);
    }
  });
  it('does not contain the removed bootstrap production credential path',()=>{
    const auth=fs.readFileSync('src/lib/auth.ts','utf8');expect(auth).not.toContain('BOOTSTRAP_ADMIN_PASSWORD');expect(auth).not.toContain('render-bootstrap-admin');
  });
});
