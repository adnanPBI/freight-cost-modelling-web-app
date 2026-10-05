import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';

export default async function Page({searchParams}:{searchParams:Promise<{id?:string}>}){
  const session=await AuthGate(); const q=await searchParams;
  const carriers=await prisma.carrier.findMany({where:{tenantId:session.tenantId},include:{aliases:true,rateCards:{include:{dc:true,mode:true}},allocations:{include:{lane:true}}},orderBy:{name:'asc'}});
  const selected=q.id?carriers.find(c=>c.id===q.id):null;
  const activeCount=carriers.filter(c=>c.active).length;
  const contractedScopes=new Set(carriers.flatMap(c=>c.rateCards.filter(r=>r.commercialStatus==='CONTRACTED_ACTIVE').map(r=>r.dcId+'|'+r.modeId))).size;
  const rateVersions=carriers.reduce((sum,c)=>sum+c.rateCards.length,0);
  const allocationRules=carriers.reduce((sum,c)=>sum+c.allocations.length,0);
  return <AppShell><PageHeader eyebrow="Master data" title="Carriers" description="Maintain carrier identities, aliases, commercial coverage and allocation participation from one governed master-data view."/>
    <div className="summaryStrip"><div className="summaryCell"><div className="summaryLabel">Active carriers</div><div className="summaryValue">{activeCount}</div><div className="summaryNote">Enabled for operational use</div></div><div className="summaryCell"><div className="summaryLabel">Contracted scopes</div><div className="summaryValue">{contractedScopes}</div><div className="summaryNote">DC / mode combinations</div></div><div className="summaryCell"><div className="summaryLabel">Rate-card versions</div><div className="summaryValue">{rateVersions}</div><div className="summaryNote">Historic and current</div></div><div className="summaryCell"><div className="summaryLabel">Allocation rules</div><div className="summaryValue">{allocationRules}</div><div className="summaryNote">Across active and historical keys</div></div></div>
    <div className="two">
      <div className="tableWrap"><table className="table"><thead><tr><th>Code</th><th>Carrier</th><th>Aliases</th><th>DCs / modes</th><th>Status</th></tr></thead><tbody>{carriers.map(c=>{
        const scopes=[...new Set(c.rateCards.map(r=>r.dc.code+' / '+r.mode.code))];
        return <tr key={c.id}><td><a href={'/carriers?id='+c.id}><b>{c.code}</b></a></td><td>{c.name}</td><td>{c.aliases.map(a=>a.alias).join(', ')||'—'}</td><td>{scopes.join(', ')||'—'}</td><td><span className={c.active?'badge ok':'badge'}>{c.active?'Active':'Inactive'}</span></td></tr>})}</tbody></table></div>
      <div className="card"><h2>{selected?'Edit carrier':'Add carrier'}</h2><form action="/api/carriers" method="post" className="stack">{selected&&<input type="hidden" name="id" value={selected.id}/>}<div className="field"><label>Code</label><input name="code" required defaultValue={selected?.code??''}/></div><div className="field"><label>Name</label><input name="name" required defaultValue={selected?.name??''}/></div><div className="field"><label>Aliases (comma separated)</label><input name="aliases" defaultValue={selected?.aliases.map(a=>a.alias).join(', ')??''}/></div><div className="field"><label>Notes</label><textarea name="notes" defaultValue={selected?.notes??''}/></div><button className="btn primary" type="submit">{selected?'Save new revision':'Create carrier'}</button></form></div>
    </div>
    {selected&&<div className="section grid"><div className="card"><b>Rate-card versions</b><div className="kpi">{selected.rateCards.length}</div></div><div className="card"><b>Allocated rules</b><div className="kpi">{selected.allocations.length}</div></div><div className="card"><b>Contracted scopes</b><div className="kpi">{new Set(selected.rateCards.filter(r=>r.commercialStatus==='CONTRACTED_ACTIVE').map(r=>r.dcId+'|'+r.modeId)).size}</div></div><div className="card"><b>Current aliases</b><div className="kpi">{selected.aliases.length}</div></div></div>}
  </AppShell>;
}
