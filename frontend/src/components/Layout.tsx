import { NavLink, Outlet } from 'react-router-dom'
import {PeriodProvider,usePeriod} from '../period'
const nav=[['/','Overview'],['/transactions','Transactions'],['/import','Import & Review'],['/ai','AI Insights'],['/settings','Settings']]
function Shell(){
  const {period,setPeriodKey,options}=usePeriod()
  return <div className="app"><aside className="sidebar"><div><div className="brand"><div className="logo">₹</div><b>LEDGER</b></div><nav>{nav.map(([to,label])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`nav ${isActive?'active':''}`}>{label}</NavLink>)}</nav></div><div className="profile"><div className="avatar">R</div><div><strong>Raj</strong><small>Local ledger</small></div></div></aside><div className="shell"><header><div className="period">{options.map(o=><button key={o.key} className={period.key===o.key?'active':''} onClick={()=>setPeriodKey(o.key)}>{o.label}</button>)}</div><span className="date">{period.rangeLabel}</span></header><main><Outlet/></main></div><div className="mobile-nav">{nav.map(([to,label])=><NavLink key={to} to={to} end={to==='/' }>{label.split(' ')[0]}</NavLink>)}</div></div>
}
export default function Layout(){return <PeriodProvider><Shell/></PeriodProvider>}
