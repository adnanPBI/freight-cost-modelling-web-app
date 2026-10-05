export function PageHeader({title,eyebrow,description,actions}:{title:string;eyebrow?:string;description?:string;actions?:React.ReactNode}){
  return <div className="pageHeader"><div className="pageHeaderMain">{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1 className="h1">{title}</h1>{description&&<p className="pageDescription">{description}</p>}</div>{actions&&<div className="pageActions">{actions}</div>}</div>
}
export function Kpi({label,value,detail,tone}:{label:string;value:string;detail?:string;tone?:'gold'|'ok'|'warn'|'danger'}){
  return <div className={'card metricCard '+(tone??'')}><div className="metricTop"><div className="metricLabel">{label}</div><span className="metricAccent"/></div><div className="kpi">{value}</div>{detail&&<div className="metricDetail">{detail}</div>}</div>
}
