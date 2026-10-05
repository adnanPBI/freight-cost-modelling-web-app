import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';

export default async function Page(){
  const s=await AuthGate(); const rows=await prisma.postcodeMapping.findMany({where:{tenantId:s.tenantId},include:{lane:true},orderBy:[{countryCode:'asc'},{prefix:'asc'},{version:'desc'}]});
  const current=rows.filter(r=>!r.validTo).length,countries=new Set(rows.map(r=>r.countryCode)).size,historical=rows.filter(r=>r.validTo).length,mapped=rows.filter(r=>r.laneId).length;
  return <AppShell><PageHeader eyebrow="Longest-prefix mapping with history" title="Postcode → Region Mapping" description="Govern destination-region resolution with leading-zero preservation, longest-prefix precedence and effective-dated mapping history." actions={<><a className="btn gold" href="/imports">Import mappings</a><a className="btn" href="/api/export/postcode-mappings">Export editable .xlsx</a></>}/>
    <div className="summaryStrip"><div className="summaryCell"><div className="summaryLabel">Current prefixes</div><div className="summaryValue">{current}</div><div className="summaryNote">Active mapping versions</div></div><div className="summaryCell"><div className="summaryLabel">Countries</div><div className="summaryValue">{countries}</div><div className="summaryNote">Destination mapping coverage</div></div><div className="summaryCell"><div className="summaryLabel">Historical versions</div><div className="summaryValue">{historical}</div><div className="summaryNote">Effective-dated prior mappings</div></div><div className="summaryCell"><div className="summaryLabel">Lane-linked records</div><div className="summaryValue">{mapped}</div><div className="summaryNote">Mappings connected to lanes</div></div></div>
    <div className="notice">Stored prefixes are uppercased with spaces removed and leading zeroes retained. The longest matching active prefix wins. Re-importing a changed prefix with Valid From creates a new version and remaps the Volumes Master.</div>
    <div className="section tableWrap"><table className="table"><thead><tr><th>Country</th><th>Prefix</th><th>Region</th><th>Lane</th><th>Valid from</th><th>Valid to</th><th>Version</th><th>Notes</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.countryCode}</td><td>{r.prefix}</td><td>{r.destinationRegion}</td><td>{r.lane?.laneIdentifier??'—'}</td><td>{r.validFrom?.toISOString().slice(0,10)??'—'}</td><td>{r.validTo?.toISOString().slice(0,10)??'Current'}</td><td>v{r.version}</td><td>{r.notes??''}</td></tr>)}</tbody></table></div>
  </AppShell>;
}
