export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const q=await searchParams;
  return <div className="login">
    <section className="loginAside">
      <div className="loginBrand"><div className="loginBrandMark">PG</div><div className="loginBrandName"><small>Pantheras Global</small>Carrier Rate & Allocation</div></div>
      <div className="loginPitch"><div className="heroKicker">Private logistics intelligence</div><h2>Control freight cost, allocation and carrier risk from one workspace.</h2><p>Manage contracted rates, customer demand, allocation ladders, scenarios and commercial history with tenant-scoped governance and auditable Excel workflows.</p>
        <div className="loginFeatureGrid"><div className="loginFeature"><b>Rate intelligence</b><span>FTL + 1–36 pallet bands</span></div><div className="loginFeature"><b>Allocation governance</b><span>Primary through Backup 2</span></div><div className="loginFeature"><b>Scenario modelling</b><span>Replacement, split and conversion</span></div><div className="loginFeature"><b>Coverage assurance</b><span>Risk gaps, expiry and exports</span></div></div>
      </div>
      <div className="loginAsideFooter">EU-hosted workspace · EUR commercial model · Authenticated access only</div>
    </section>
    <section className="loginStage">
      <form className="loginCard stack" action="/api/auth/login" method="post">
        <div className="eyebrow">Secure access</div><h1>Welcome back</h1><p className="muted" style={{marginTop:0}}>Sign in to the Pantheras freight-control workspace.</p>
        {q.error==='1'&&<div className="dangerText">Invalid email or password.</div>}
        {q.error==='service'&&<div className="dangerText">The authentication service is temporarily unavailable. Please try again shortly.</div>}
        <div className="field"><label>Email address</label><input name="email" type="email" autoComplete="email" placeholder="name@company.com" required/></div>
        <div className="field"><label>Password</label><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/></div>
        <button className="btn primary" type="submit">Sign in to workspace</button>
        <div className="securityNote"><span className="securityLock">◆</span><span>No public registration. Sessions are protected by secure HTTP-only cookies and tenant-scoped access controls.</span></div>
      </form>
    </section>
  </div>;
}
