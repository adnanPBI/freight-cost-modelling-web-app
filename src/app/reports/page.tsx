import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';
import { coverageGaps } from '@/lib/coverage';

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const s=await AuthGate(); const q=await searchParams; const asOf=new Date(q.asOf||Date.now()); const expiryDays=Number(q.expiryDays||90);
  const [dcs,modes,carriers]=await Promise.all([
    prisma.distributionCentre.findMany({where:{tenantId:s.tenantId,active:true},orderBy:{code:'asc'}}),
    prisma.transportMode.findMany({where:{tenantId:s.tenantId,active:true},orderBy:{code:'asc'}}),
    prisma.carrier.findMany({where:{tenantId:s.tenantId,active:true},orderBy:{name:'asc'}})
  ]);
  const rows=await coverageGaps({tenantId:s.tenantId,asOf,expiryDays,dcId:q.dcId||undefined,modeId:q.modeId||undefined,country:q.country?.toUpperCase()||undefined,carrierId:q.carrierId||undefined});
  const qs=new URLSearchParams(Object.entries({...q,asOf:asOf.toISOString().slice(0,10),expiryDays:String(expiryDays)}).filter(([,v])=>v!=null) as [string,string][]).toString();
  return <AppShell><PageHeader eyebrow="Exceptions & exports" title="Coverage Gaps Report" actions={<a className="btn gold" href={'/api/export/coverage?'+qs}>Export filtered .xlsx</a>}/>
    <form method="get" className="card formgrid"><div className="field"><label>DC</label><select name="dcId" defaultValue={q.dcId??''}><option value="">All</option>{dcs.map(d=><option key={d.id} value={d.id}>{d.code}</option>)}</select></div><div className="field"><label>Mode</label><select name="modeId" defaultValue={q.modeId??''}><option value="">All</option>{modes.map(m=><option key={m.id} value={m.id}>{m.code}</option>)}</select></div><div className="field"><label>Destination country</label><input name="country" defaultValue={q.country??''}/></div><div className="field"><label>Carrier</label><select name="carrierId" defaultValue={q.carrierId??''}><option value="">All</option>{carriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Expiry horizon</label><select name="expiryDays" defaultValue={String(expiryDays)}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></div><div className="field"><label>As of</label><input type="date" name="asOf" defaultValue={asOf.toISOString().slice(0,10)}/></div><div style={{alignSelf:'end'}}><button className="btn primary">Apply filters</button></div></form>
    <div className="section tableWrap"><table className="table"><thead><tr><th>Severity</th><th>Issue</th><th>DC</th><th>Mode</th><th>Country</th><th>Lane</th><th>Carrier</th><th>Volume at risk</th><th>Details</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td><span className={r.severity==='HIGH'?'badge danger':r.severity==='MEDIUM'?'badge warn':'badge'}>{r.severity}</span></td><td>{r.issue}</td><td>{r.dc??'—'}</td><td>{r.mode??'—'}</td><td>{r.country??'—'}</td><td>{r.lane??'—'}</td><td>{r.carrier??'—'}</td><td>{r.volume.toLocaleString()}</td><td>{r.details}</td></tr>)}</tbody></table></div>
    <div className="section card"><h2>Export centre</h2><div className="toolbar"><a className="btn" href="/api/export/allocations">Current allocation key</a><a className="btn" href="/api/export/rate-cards">Rate cards</a><a className="btn" href="/api/export/volumes">Volumes Master</a><a className="btn" href="/api/export/cost-profiles">Cost profiles</a><a className="btn" href="/api/export/postcode-mappings">Postcode mapping</a></div></div>
  </AppShell>;
}
