import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';
import { aggregatedCostProfile } from '@/lib/cost-engine';

export default async function Page({searchParams}:{searchParams:Promise<{customer?:string}>}){
  const s=await AuthGate(); const q=await searchParams;
  const [volumes,cost]=await Promise.all([
    prisma.volumeRecord.findMany({where:{tenantId:s.tenantId},include:{dc:true,mode:true,lane:true},orderBy:{customerCode:'asc'}}),
    aggregatedCostProfile({tenantId:s.tenantId,asOf:new Date()})
  ]);
  const groups=new Map<string,{code:string;name:string;shipments:number;pallets:number;spend:number;dcs:Set<string>;modes:Set<string>;lanes:Set<string>}>();
  for(const v of volumes){
    const g=groups.get(v.customerCode)??{code:v.customerCode,name:v.customerName,shipments:0,pallets:0,spend:0,dcs:new Set(),modes:new Set(),lanes:new Set()};
    g.shipments+=Number(v.shipmentCount);g.pallets+=Number(v.palletCount??0);g.dcs.add(v.dc.code);g.modes.add(v.mode.code);if(v.lane)g.lanes.add(v.lane.laneIdentifier??v.lane.destinationCountry+'-'+v.lane.destinationRegion);groups.set(v.customerCode,g);
  }
  for(const r of cost.rows){if(!r.customerCode)continue;const g=groups.get(r.customerCode);if(g)g.spend+=Number(r.total??0);}
  const selected=q.customer?groups.get(q.customer):null; const selectedVolumes=q.customer?volumes.filter(v=>v.customerCode===q.customer):[];
  return <AppShell><PageHeader eyebrow="Customer-level demand & allocation" title="Customers"/>
    <div className="tableWrap"><table className="table"><thead><tr><th>Customer</th><th>DCs</th><th>Modes</th><th>Lanes</th><th>Shipments</th><th>Pallets</th><th>Modelled spend</th></tr></thead><tbody>{[...groups.values()].map(g=><tr key={g.code}><td><a href={'/customers?customer='+encodeURIComponent(g.code)}><b>{g.code}</b> · {g.name}</a></td><td>{[...g.dcs].join(', ')}</td><td>{[...g.modes].join(', ')}</td><td>{g.lanes.size}</td><td>{g.shipments.toLocaleString()}</td><td>{g.pallets.toLocaleString()}</td><td>€{g.spend.toLocaleString(undefined,{maximumFractionDigits:0})}</td></tr>)}</tbody></table></div>
    {selected&&<div className="section card"><h2>{selected.code} · {selected.name}</h2><div className="grid"><div className="card"><b>Shipments</b><div className="kpi">{selected.shipments.toLocaleString()}</div></div><div className="card"><b>Pallets</b><div className="kpi">{selected.pallets.toLocaleString()}</div></div><div className="card"><b>Modelled spend</b><div className="kpi">€{selected.spend.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div><div className="card"><b>Lanes</b><div className="kpi">{selected.lanes.size}</div></div></div><div className="tableWrap section"><table className="table"><thead><tr><th>DC</th><th>Mode</th><th>Lane</th><th>Postcode</th><th>Shipments</th><th>Pallets</th></tr></thead><tbody>{selectedVolumes.map(v=><tr key={v.id}><td>{v.dc.code}</td><td>{v.mode.code}</td><td>{v.lane?.laneIdentifier??'UNMAPPED'}</td><td>{v.normalizedPostcode}</td><td>{Number(v.shipmentCount)}</td><td>{v.palletCount==null?'—':Number(v.palletCount)}</td></tr>)}</tbody></table></div></div>}
  </AppShell>;
}
