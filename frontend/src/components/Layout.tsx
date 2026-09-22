import {NavLink,Outlet} from 'react-router-dom'
import {PeriodProvider,usePeriod} from '../period'
import {FamilyProvider,useFamily} from '../family'
import {api} from '../api/client'

const nav=[['/','Overview'],['/transactions','Transactions'],['/import','Import & Review'],['/ai','AI Insights'],['/settings','Settings']]

function Shell(){
  const {period,setPeriodKey,options}=usePeriod()
  const {scopeKey,setScopeKey,members,scopeLabel}=useFamily()

  async function signOut(){
    try{await api.logout()}finally{window.location.replace('/')}
  }

  return <div className="app">
    <aside className="sidebar">
      <div>
        <div className="brand"><div className="logo">₹</div><b>LEDGER</b></div>
        <nav>{nav.map(([to,label])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`nav ${isActive?'active':''}`}>{label}</NavLink>)}</nav>
      </div>
      <div className="profile">
        <div className="avatar">R</div>
        <div className="profile-copy"><strong>Owner</strong><small>Private ledger</small></div>
        <button className="ghost signout" onClick={signOut}>Sign out</button>
      </div>
    </aside>

    <div className="shell">
      <header>
        <div className="header-filters">
          <div className="period desktop-period">
            {options.map(o=><button key={o.key} className={period.key===o.key?'active':''} onClick={()=>setPeriodKey(o.key)}>{o.label}</button>)}
          </div>

          <select
            className="mobile-period-select"
            value={period.key}
            onChange={e=>setPeriodKey(e.target.value as typeof period.key)}
            aria-label="Select period"
          >
            {options.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          <select
            className="family-scope-select"
            value={scopeKey}
            onChange={e=>setScopeKey(e.target.value)}
            aria-label="Select family scope"
          >
            <option value="self">Self</option>
            <option value="family">Family</option>
            <option value="all">Self + Family</option>
            {members.map(member=><option key={member.id} value={`member:${member.id}`}>{member.name}</option>)}
          </select>
        </div>

        <span className="date">{period.rangeLabel} • {scopeLabel}</span>
      </header>
      <main><Outlet/></main>
    </div>

    <div className="mobile-nav">{nav.map(([to,label])=><NavLink key={to} to={to} end={to==='/' }>{label.split(' ')[0]}</NavLink>)}</div>
  </div>
}

export default function Layout(){
  return <FamilyProvider><PeriodProvider><Shell/></PeriodProvider></FamilyProvider>
}
