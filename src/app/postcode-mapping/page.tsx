import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';
import { PageHeader } from '@/components/Page';
import { prisma } from '@/lib/prisma';

export default async function Page(){
  const s=await AuthGate(); const rows=await prisma.postcodeMapping.findMany({where:{tenantId:s.tenantId},include:{lane:true},orderBy:[{countryCode:'asc'},{prefix:'asc'},{version:'desc'}]});
  return <AppShell><PageHeader eyebrow="Longest-prefix mapping with history" title="Postcode → Region Mapping" actions={<><a className="btn gold" href="/imports">Import mappings</a><a className="btn" href="/api/export/postcode-mappings">Export editable .xlsx</a></>}/>
    <div className="notice">Stored prefixes are uppercased with spaces removed and leading zeroes retained. The longest matching active prefix wins. Re-importing a changed prefix with Valid From creates a new version and remaps the Volumes Master.</div>
    <div className="section tableWrap"><table className="table"><thead><tr><th>Country</th><th>Prefix</th><th>Region</th><th>Lane</th><th>Valid from</th><th>Valid to</th><th>Version</th><th>Notes</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.countryCode}</td><td>{r.prefix}</td><td>{r.destinationRegion}</td><td>{r.lane?.laneIdentifier??'—'}</td><td>{r.validFrom?.toISOString().slice(0,10)??'—'}</td><td>{r.validTo?.toISOString().slice(0,10)??'Current'}</td><td>v{r.version}</td><td>{r.notes??''}</td></tr>)}</tbody></table></div>
  </AppShell>;
}
