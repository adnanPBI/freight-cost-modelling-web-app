'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem={href:string;label:string;icon:string};
const groups:{label:string;items:NavItem[]}[]=[
  {label:'Overview',items:[
    {href:'/dashboard',label:'Dashboard',icon:'dashboard'},
    {href:'/imports',label:'Imports',icon:'import'},
  ]},
  {label:'Network & commercial',items:[
    {href:'/carriers',label:'Carriers',icon:'carrier'},
    {href:'/rate-cards',label:'Rate Cards',icon:'document'},
    {href:'/lanes',label:'Lanes / Search',icon:'route'},
    {href:'/allocations',label:'Allocations',icon:'layers'},
  ]},
  {label:'Demand & modelling',items:[
    {href:'/volumes',label:'Volumes',icon:'bars'},
    {href:'/customers',label:'Customers',icon:'users'},
    {href:'/postcode-mapping',label:'Postcode Mapping',icon:'pin'},
    {href:'/scenarios',label:'Scenarios',icon:'branch'},
  ]},
  {label:'Governance',items:[
    {href:'/commercials',label:'Fuel & Accessorials',icon:'coin'},
    {href:'/reports',label:'Reports / Exports',icon:'report'},
    {href:'/settings',label:'Settings',icon:'settings'},
  ]}
];

function Icon({name}:{name:string}){
  const common={viewBox:'0 0 24 24','aria-hidden':true};
  if(name==='dashboard')return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if(name==='import')return <svg {...common}><path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M4 17v3h16v-3"/></svg>;
  if(name==='carrier')return <svg {...common}><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
  if(name==='document')return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>;
  if(name==='route')return <svg {...common}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5c3-4 6-2 8-5s0-4 1-4"/></svg>;
  if(name==='layers')return <svg {...common}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>;
  if(name==='bars')return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></svg>;
  if(name==='users')return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6"/><path d="M16 6.5a2.5 2.5 0 0 1 0 5M17 14c2.5.5 3.5 2.5 4 5"/></svg>;
  if(name==='pin')return <svg {...common}><path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z"/><circle cx="12" cy="10" r="2"/></svg>;
  if(name==='branch')return <svg {...common}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3c0 3 2 4 6 4s6-1 6-4V7M12 14v3"/></svg>;
  if(name==='coin')return <svg {...common}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>;
  if(name==='report')return <svg {...common}><path d="M5 3h14v18H5z"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.5 3.1h5l.5-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></svg>;
}

export function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  return <div className="shell">
    <aside className="sidebar">
      <div className="brandBlock"><div className="brandMark">PG</div><div className="brand"><small>Pantheras Global</small>Carrier Rate & Allocation</div></div>
      <div className="workspaceChip"><span className="workspaceDot"/>Secure corporate workspace</div>
      <nav className="nav">{groups.map(group=><div className="navGroup" key={group.label}><div className="navLabel">{group.label}</div>{group.items.map(item=>{
        const active=pathname===item.href||pathname.startsWith(item.href+'/');
        return <Link key={item.href} href={item.href} className={active?'active':''}><span className="navIcon"><Icon name={item.icon}/></span><span>{item.label}</span></Link>;
      })}</div>)}</nav>
      <div className="sidebarFooter"><div className="sidebarFooterRow"><span>Hosting region</span><strong>EU / Frankfurt</strong></div><div className="sidebarFooterRow"><span>Commercial currency</span><strong>EUR</strong></div></div>
    </aside>
    <main className="main">
      <div className="appTopbar">
        <div className="topbarLeft"><div className="topbarCrumb"><span>Operations</span><span>›</span><strong>Freight control</strong></div></div>
        <div className="topbarRight"><span className="topbarPill live">Operational</span><span className="topbarPill">Private tenant</span><span className="topbarPill">EUR</span></div>
      </div>
      <div className="mainInner">{children}</div>
    </main>
  </div>;
}
