import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';

function PreviewTable({rows}:{rows:any[]}){
  if(!rows?.length)return <p className="muted">No parsed rows.</p>;
  const keys=[...new Set(rows.slice(0,10).flatMap(r=>Object.keys(r).filter(k=>!['palletBands','sourceMetadata'].includes(k))))].slice(0,10);
  return <div className="tableWrap"><table className="table"><thead><tr>{keys.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0,10).map((r,i)=><tr key={i}>{keys.map(k=><td key={k}>{typeof r[k]==='object'?JSON.stringify(r[k]):String(r[k]??'')}</td>)}</tr>)}</tbody></table></div>
}

export default async function Imports({searchParams}:{searchParams:Promise<{job?:string;committed?:string}>}){
  const session=await AuthGate(); const q=await searchParams;
  const [carriers,dcs,modes,job,recentJobs,completedCount,validatedCount,failedCount]=await Promise.all([
    prisma.carrier.findMany({where:{tenantId:session.tenantId,active:true},orderBy:{name:'asc'}}),
    prisma.distributionCentre.findMany({where:{tenantId:session.tenantId,active:true},orderBy:{code:'asc'}}),
    prisma.transportMode.findMany({where:{tenantId:session.tenantId,active:true},orderBy:{code:'asc'}}),
    q.job?prisma.importJob.findFirst({where:{id:q.job,tenantId:session.tenantId}}):Promise.resolve(null),
    prisma.importJob.findMany({where:{tenantId:session.tenantId},orderBy:{createdAt:'desc'},take:8}),
    prisma.importJob.count({where:{tenantId:session.tenantId,status:'COMPLETED'}}),
    prisma.importJob.count({where:{tenantId:session.tenantId,status:'VALIDATED'}}),
    prisma.importJob.count({where:{tenantId:session.tenantId,status:{in:['FAILED','COMPLETED_WITH_ERRORS']}}})
  ]);
  const parsed=job?.parsedData as any; const issues=((job?.issues as any[])??[]);
  const errors=issues.filter(x=>x.severity==='error').length;
  return <AppShell>
    <PageHeader eyebrow="Excel intake" title="Imports" description="Validate, review and commit governed Excel imports with row-level errors, checksums and immutable import history before commercial data is written."/>
    <div className="summaryStrip"><div className="summaryCell"><div className="summaryLabel">Completed imports</div><div className="summaryValue">{completedCount}</div><div className="summaryNote">Committed into business tables</div></div><div className="summaryCell"><div className="summaryLabel">Ready to commit</div><div className="summaryValue">{validatedCount}</div><div className="summaryNote">Validated without blocking errors</div></div><div className="summaryCell"><div className="summaryLabel">Needs attention</div><div className="summaryValue">{failedCount}</div><div className="summaryNote">Failed or completed with errors</div></div><div className="summaryCell"><div className="summaryLabel">Supported workbook types</div><div className="summaryValue">4</div><div className="summaryNote">Rates · allocations · volumes · postcodes</div></div></div>
    <div className="notice">Supported: FTL and 1–36 pallet-band rate cards, allocation keys, customer volumes and postcode mappings. Header rows are detected; leading zeroes are preserved; validation is completed before any business data is written.</div>
    <div className="section card"><h2>1. Validate workbook</h2>
      <form action="/api/imports/preview" method="post" encType="multipart/form-data" className="formgrid">
        <div className="field"><label>Import type</label><select name="type" defaultValue="rate"><option value="rate">Rate card</option><option value="allocation">Allocation key</option><option value="volume">Customer volumes</option><option value="postcode">Postcode mapping</option></select></div>
        <div className="field"><label>Mode override (only if workbook is ambiguous)</label><select name="modeOverride" defaultValue=""><option value="">Auto detect</option><option>FTL</option><option>PALLET</option><option>LTL-PALLET</option></select></div>
        <div className="field"><label>Excel workbook (.xlsx, max 10 MB)</label><input name="file" type="file" accept=".xlsx" required/></div>
        <div><button className="btn gold" type="submit">Validate & preview</button></div>
      </form>
    </div>
    <div className="section card panelCard"><div className="panelHeader"><div><div className="sectionTitle">Recent import activity</div><div className="sectionSubtitle">Latest workbook validation and commit events for this tenant.</div></div></div><div className="tableWrap" style={{border:0,borderRadius:0,boxShadow:'none'}}><table className="table"><thead><tr><th>File</th><th>Type</th><th>Status</th><th>Rows</th><th>Errors</th><th>Warnings</th><th>Created</th></tr></thead><tbody>{recentJobs.map(r=><tr key={r.id}><td><a href={'/imports?job='+r.id}><b>{r.filename}</b></a></td><td>{r.type}</td><td><span className={r.status==='COMPLETED'?'badge ok':r.status==='VALIDATED'?'badge warn':r.status==='FAILED'||r.status==='COMPLETED_WITH_ERRORS'?'badge danger':'badge'}>{r.status}</span></td><td>{r.successRows}</td><td>{r.errorRows}</td><td>{r.warningRows}</td><td>{r.createdAt.toISOString().slice(0,10)}</td></tr>)}</tbody></table></div></div>
    {job&&<div className="section stack">
      {q.committed&&<div className="notice">Import committed successfully. Import history ID: <b>{job.id}</b></div>}
      <div className="card"><h2>2. Review result</h2><p><b>{job.filename}</b> · {job.type} · status {job.status}</p>
        <p><span className="badge ok">{job.successRows} parsed rows</span> <span className={errors?'badge danger':'badge ok'}>{errors} errors</span> <span className="badge warn">{job.warningRows} warnings</span></p>
        {issues.length>0&&<div className="tableWrap"><table className="table"><thead><tr><th>Severity</th><th>Sheet</th><th>Row</th><th>Message</th></tr></thead><tbody>{issues.slice(0,100).map((i:any,index:number)=><tr key={index}><td><span className={i.severity==='error'?'badge danger':'badge warn'}>{i.severity}</span></td><td>{i.sheet}</td><td>{i.row??'—'}</td><td>{i.message}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card"><h2>Parsed preview</h2><PreviewTable rows={parsed?.rows??[]}/></div>
      {job.status==='VALIDATED'&&errors===0&&<div className="card"><h2>3. Commit validated import</h2>
        <form action="/api/imports/commit" method="post" className="formgrid">
          <input type="hidden" name="jobId" value={job.id}/>
          {job.type==='RATE_CARD'&&<>
            <div className="field"><label>Carrier</label><select name="carrier" required defaultValue=""><option value="">Select carrier</option>{carriers.map(c=><option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}</select></div>
            <div className="field"><label>Origin DC</label><select name="dc" required defaultValue=""><option value="">Select DC</option>{dcs.map(d=><option key={d.id} value={d.code}>{d.code} — {d.name}</option>)}</select></div>
            <div className="field"><label>Mode</label><select name="mode" required defaultValue={parsed?.rows?.[0]?.mode??''}>{modes.filter(m=>['FTL','PALLET','LTL-PALLET'].includes(m.code)).map(m=><option key={m.id}>{m.code}</option>)}</select></div>
            <div className="field"><label>Valid From</label><input name="validFrom" type="date" required defaultValue={parsed?.metadata?.validFrom?.slice?.(0,10)??''}/></div>
            <div className="field"><label>Valid To</label><input name="validTo" type="date" required defaultValue={parsed?.metadata?.validTo?.slice?.(0,10)??''}/></div>
            <div className="field"><label>Commercial status</label><select name="commercialStatus" defaultValue="CONTRACTED_ACTIVE"><option>CONTRACTED_ACTIVE</option><option>SUBMISSION_RESEARCH</option><option>INACTIVE</option></select></div>
            <input type="hidden" name="currency" value="EUR"/>
          </>}
          {job.type==='ALLOCATION_KEY'&&<>
            <div className="field"><label>Change note</label><input name="changeNote" defaultValue={'Imported '+job.filename}/></div>
            <div className="field"><label>Existing Draft handling</label><select name="replaceDraft" defaultValue="false"><option value="false">Stop if Draft exists</option><option value="true">Replace existing Draft</option></select></div>
          </>}
          <div style={{alignSelf:'end'}}><button className="btn primary" type="submit">Commit import</button></div>
        </form>
      </div>}
    </div>}
  </AppShell>;
}
