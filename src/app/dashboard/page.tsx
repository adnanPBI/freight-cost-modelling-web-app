import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader, Kpi } from '@/components/Page';
import { prisma } from '@/lib/prisma';
import { coverageGaps } from '@/lib/coverage';
import { aggregatedCostProfile } from '@/lib/cost-engine';

export default async function Dashboard(){
  const session=await AuthGate(); const now=new Date(); const soon=new Date(now);soon.setUTCDate(soon.getUTCDate()+90);
  const [activeRates,lanesWithVolume,activeKey,coverage,cost,unmapped]=await Promise.all([
    prisma.rateCard.count({where:{tenantId:session.tenantId,commercialStatus:'CONTRACTED_ACTIVE',validFrom:{lte:now},validTo:{gte:now},status:{not:'SUPERSEDED'}}}),
    prisma.volumeRecord.findMany({where:{tenantId:session.tenantId,laneId:{not:null}},distinct:['laneId'],select:{laneId:true}}),
    prisma.allocationKey.findFirst({where:{tenantId:session.tenantId,status:'ACTIVE'},orderBy:{version:'desc'}}),
    coverageGaps({tenantId:session.tenantId,asOf:now,expiryDays:90}),
    aggregatedCostProfile({tenantId:session.tenantId,asOf:now}),
    prisma.volumeRecord.count({where:{tenantId:session.tenantId,laneId:null}})
  ]);
  const expiring=await prisma.rateCard.count({where:{tenantId:session.tenantId,commercialStatus:'CONTRACTED_ACTIVE',validTo:{gte:now,lte:soon}}});
  return <AppShell><PageHeader eyebrow="Network control" title="Dashboard" actions={<form action="/api/auth/logout" method="post"><button className="btn">Logout</button></form>}/>
    <div className="grid"><Kpi label="Active contracted rate cards" value={String(activeRates)} detail={expiring+' expire within 90 days'}/><Kpi label="Lanes with demand" value={String(lanesWithVolume.length)} detail={coverage.length+' coverage exceptions'}/><Kpi label="Latest active allocation key" value={activeKey?.displayKey??'None'} detail={activeKey?.effectiveFrom?'Effective '+activeKey.effectiveFrom.toISOString().slice(0,10):'No published key'}/><Kpi label="Modelled cost" value={'€'+cost.total.toLocaleString(undefined,{maximumFractionDigits:0})} detail={unmapped+' unmapped volume record(s)'}/></div>
    <div className="section card"><h2>Highest-priority coverage gaps</h2>{coverage.length?<div className="tableWrap"><table className="table"><thead><tr><th>Severity</th><th>Issue</th><th>Lane</th><th>Carrier</th><th>Volume</th><th>Details</th></tr></thead><tbody>{coverage.slice(0,12).map((r,i)=><tr key={i}><td><span className={r.severity==='HIGH'?'badge danger':r.severity==='MEDIUM'?'badge warn':'badge'}>{r.severity}</span></td><td>{r.issue}</td><td>{r.lane??'—'}</td><td>{r.carrier??'—'}</td><td>{r.volume.toLocaleString()}</td><td>{r.details}</td></tr>)}</tbody></table></div>:<p className="muted">No coverage gaps found for current data.</p>}</div>
  </AppShell>;
}
