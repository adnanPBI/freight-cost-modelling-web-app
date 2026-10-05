import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader, Kpi } from '@/components/Page';
import { prisma } from '@/lib/prisma';
import { aggregatedCostProfile } from '@/lib/cost-engine';

export default async function Page({searchParams}:{searchParams:Promise<{id?:string}>}){
  const s=await AuthGate(); const q=await searchParams;
  const [rows,cost]=await Promise.all([
    prisma.volumeRecord.findMany({where:{tenantId:s.tenantId},include:{dc:true,mode:true,lane:true},orderBy:{createdAt:'desc'},take:500}),
    aggregatedCostProfile({tenantId:s.tenantId,asOf:new Date()})
  ]);
  const selected=q.id?rows.find(r=>r.id===q.id):null;
  const customers=new Set(rows.map(r=>r.customerCode)); const shipments=rows.reduce((x,r)=>x+Number(r.shipmentCount),0); const pallets=rows.reduce((x,r)=>x+Number(r.palletCount??0),0); const unmapped=rows.filter(r=>!r.laneId).length;
  return <AppShell><PageHeader eyebrow="Demand independent of commercial data" title="Volumes Master" description="Manage customer demand separately from commercial terms, with mapped lanes, shipment/pallet assumptions and modelled primary cost." actions={<><a className="btn gold" href="/imports">Import volumes</a><a className="btn" href="/api/export/volumes">Export volumes</a><a className="btn" href="/api/export/cost-profiles">Export cost profile</a></>}/>
    <div className="grid"><Kpi label="Customers" value={String(customers.size)}/><Kpi label="Shipments" value={shipments.toLocaleString()}/><Kpi label="Pallets" value={pallets.toLocaleString()}/><Kpi label="Unmapped records" value={String(unmapped)} detail={'Current primary cost €'+cost.total.toLocaleString(undefined,{maximumFractionDigits:0})}/></div>
    <div className="section tableWrap"><table className="table"><thead><tr><th>Customer</th><th>DC</th><th>Mode</th><th>Country</th><th>Postcode</th><th>Region</th><th>Lane</th><th>Shipments</th><th>Pallets</th><th>Avg pallets</th><th>Period</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><a href={'/volumes?id='+r.id}><b>{r.customerCode}</b> · {r.customerName}</a></td><td>{r.dc.code}</td><td>{r.mode.code}</td><td>{r.destinationCountry}</td><td>{r.normalizedPostcode}</td><td>{r.destinationRegion??'UNMAPPED'}</td><td>{r.lane?.laneIdentifier??'—'}</td><td>{Number(r.shipmentCount).toLocaleString()}</td><td>{r.palletCount==null?'—':Number(r.palletCount).toLocaleString()}</td><td>{r.averagePallets==null?'—':Number(r.averagePallets).toFixed(2)}</td><td>{r.period}</td></tr>)}</tbody></table></div>
    {selected&&<div className="section card"><h2>Selected / incurred accessorial assumptions</h2><p className="muted">Only assumptions entered here are costed; merely having an accessorial agreement does not incur a charge. Use accessorial codes and occurrence/units.</p><form action="/api/volumes/assumptions" method="post" className="stack"><input type="hidden" name="id" value={selected.id}/><div className="field"><label>JSON assumptions</label><textarea name="accessorialAssumptions" rows={5} defaultValue={JSON.stringify(selected.accessorialAssumptions??{},null,2)}/></div><button className="btn primary">Save assumptions as new revision</button></form></div>}
  </AppShell>;
}
