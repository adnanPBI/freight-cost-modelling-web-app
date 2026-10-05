import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader, Kpi } from '@/components/Page';
import { prisma } from '@/lib/prisma';
import { coverageGaps } from '@/lib/coverage';
import { aggregatedCostProfile } from '@/lib/cost-engine';

export default async function Dashboard(){
  const session=await AuthGate(); const now=new Date(); const soon=new Date(now);soon.setUTCDate(soon.getUTCDate()+90);
  const [activeRates,lanesWithVolume,activeKey,coverage,cost,unmapped,carrierCount,customers,drafts,imports]=await Promise.all([
    prisma.rateCard.count({where:{tenantId:session.tenantId,commercialStatus:'CONTRACTED_ACTIVE',validFrom:{lte:now},validTo:{gte:now},status:{not:'SUPERSEDED'}}}),
    prisma.volumeRecord.findMany({where:{tenantId:session.tenantId,laneId:{not:null}},distinct:['laneId'],select:{laneId:true}}),
    prisma.allocationKey.findFirst({where:{tenantId:session.tenantId,status:'ACTIVE'},orderBy:{version:'desc'}}),
    coverageGaps({tenantId:session.tenantId,asOf:now,expiryDays:90}),
    aggregatedCostProfile({tenantId:session.tenantId,asOf:now}),
    prisma.volumeRecord.count({where:{tenantId:session.tenantId,laneId:null}}),
    prisma.carrier.count({where:{tenantId:session.tenantId,active:true}}),
    prisma.volumeRecord.findMany({where:{tenantId:session.tenantId},distinct:['customerCode'],select:{customerCode:true}}),
    prisma.allocationKey.count({where:{tenantId:session.tenantId,status:'DRAFT'}}),
    prisma.importJob.count({where:{tenantId:session.tenantId,status:'COMPLETED'}})
  ]);
  const expiring=await prisma.rateCard.count({where:{tenantId:session.tenantId,commercialStatus:'CONTRACTED_ACTIVE',validTo:{gte:now,lte:soon}}});
  const high=coverage.filter(x=>x.severity==='HIGH').length,medium=coverage.filter(x=>x.severity==='MEDIUM').length,review=coverage.filter(x=>x.severity==='REVIEW').length;
  const dateLabel=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(now);
  return <AppShell>
    <PageHeader eyebrow="Executive network control" title="Freight Control Dashboard" description="Live tenant-scoped view of commercial coverage, allocation readiness and modelled network cost." actions={<form action="/api/auth/logout" method="post"><button className="btn">Sign out</button></form>}/>
    <div className="executiveHero"><div className="heroCopy"><div className="heroKicker">Network status · {dateLabel}</div><div className="heroTitle">Commercial control centre</div><div className="heroText">Review contracted coverage, compare carrier economics and move directly into rate, allocation or scenario workflows.</div></div><div className="heroActions"><a className="btn gold" href="/lanes">Compare lanes</a><a className="btn" href="/scenarios">Model scenario</a><a className="btn" href="/imports">Import workbook</a></div></div>
    <div className="grid"><Kpi tone="ok" label="Active contracted rate cards" value={String(activeRates)} detail={expiring+' expire within 90 days'}/><Kpi tone="gold" label="Lanes with demand" value={String(lanesWithVolume.length)} detail={coverage.length+' coverage exceptions'}/><Kpi label="Latest active allocation key" value={activeKey?.displayKey??'None'} detail={activeKey?.effectiveFrom?'Effective '+activeKey.effectiveFrom.toISOString().slice(0,10):'No published key'}/><Kpi tone={unmapped?'warn':'ok'} label="Modelled network cost" value={'€'+cost.total.toLocaleString(undefined,{maximumFractionDigits:0})} detail={unmapped+' unmapped volume record(s)'}/></div>
    <div className="dashboardSplit">
      <div className="card panelCard"><div className="panelHeader"><div><div className="sectionTitle">Highest-priority coverage gaps</div><div className="sectionSubtitle">Exceptions requiring commercial or allocation attention.</div></div><a className="btn" href="/reports">Open full report</a></div>{coverage.length?<div className="tableWrap" style={{border:0,borderRadius:0,boxShadow:'none'}}><table className="table"><thead><tr><th>Severity</th><th>Issue</th><th>Lane</th><th>Carrier</th><th>Volume</th><th>Details</th></tr></thead><tbody>{coverage.slice(0,10).map((r,i)=><tr key={i}><td><span className={r.severity==='HIGH'?'badge danger':r.severity==='MEDIUM'?'badge warn':'badge'}>{r.severity}</span></td><td><b>{r.issue}</b></td><td>{r.lane??'—'}</td><td>{r.carrier??'—'}</td><td>{r.volume.toLocaleString()}</td><td>{r.details}</td></tr>)}</tbody></table></div>:<div className="emptyState"><strong>Network fully covered</strong>No current coverage gaps were detected for the active demand set.</div>}</div>
      <div className="card"><div className="sectionTitle">Risk & workflow summary</div><div className="sectionSubtitle">Current exception mix and direct actions.</div><div className="priorityStack section"><div className="priorityItem"><div><strong>High priority</strong><br/><span>Commercial or allocation blocker</span></div><span className="priorityCount">{high}</span></div><div className="priorityItem"><div><strong>Medium priority</strong><br/><span>Resilience / backup coverage</span></div><span className="priorityCount">{medium}</span></div><div className="priorityItem"><div><strong>Review</strong><br/><span>Expiry or commercial review</span></div><span className="priorityCount">{review}</span></div></div><div className="quickLinks"><a className="quickLink" href="/allocations">Allocation keys →</a><a className="quickLink" href="/rate-cards">Rate history →</a><a className="quickLink" href="/commercials">Fuel & charges →</a><a className="quickLink" href="/reports">Exports →</a></div></div>
    </div>
    <div className="summaryStrip section"><div className="summaryCell"><div className="summaryLabel">Active carriers</div><div className="summaryValue">{carrierCount}</div><div className="summaryNote">Master-data records enabled</div></div><div className="summaryCell"><div className="summaryLabel">Customers represented</div><div className="summaryValue">{customers.length}</div><div className="summaryNote">Distinct customer demand codes</div></div><div className="summaryCell"><div className="summaryLabel">Draft allocation keys</div><div className="summaryValue">{drafts}</div><div className="summaryNote">Awaiting review or publish</div></div><div className="summaryCell"><div className="summaryLabel">Completed imports</div><div className="summaryValue">{imports}</div><div className="summaryNote">Audited workbook commits</div></div></div>
  </AppShell>;
}
