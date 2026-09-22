import {useEffect,useState} from 'react'
import {api} from '../api/client'
import QuickCash from '../components/QuickCash'
import type {Summary,Tx} from '../types'
import {usePeriod} from '../period'
import {useFamily} from '../family'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

export default function Overview(){
  const {period,setPeriodKey}=usePeriod()
  const {familyScope,familyUserId,scopeLabel}=useFamily()
  const [s,setS]=useState<Summary|null>(null)
  const [tx,setTx]=useState<Tx[]>([])
  const [cash,setCash]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    setLoading(true)
    setError('')
    try{
      const [summary,transactions]=await Promise.all([
        api.summary(period.from,period.to,familyScope,familyUserId),
        api.transactions('',period.from,period.to,familyScope,familyUserId)
      ])
      setS(summary)
      setTx(transactions.slice(0,4))
    }catch(e:any){
      setError(e.message||'Could not load dashboard data.')
      setS(null)
      setTx([])
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[period.from,period.to,familyScope,familyUserId])

  if(loading)return <div className="dashboard-state card">
    <div className="upload-spinner" aria-hidden="true"/>
    <div><b>Loading your ledger…</b><span>Fetching {period.label} • {scopeLabel}.</span></div>
  </div>

  if(error)return <div className="dashboard-state card error-state">
    <div><b>Could not load the dashboard</b><span>{error}</span></div>
    <button className="secondary" onClick={load}>Try again</button>
  </div>

  if(!s)return null

  const pct=s.total?Math.round(s.verified/s.total*1000)/10:0
  const maxFlow=Math.max(1,...s.cashflow.flatMap(x=>[x.income,x.spent]))
  const emptyPeriod=s.total===0
  const familyMax=Math.max(1,...s.family_spending.map(x=>x.amount))

  return <>
    <div className="page-head">
      <div><small>{period.label.toUpperCase()} • {scopeLabel.toUpperCase()}</small><h1>Dashboard</h1></div>
      <button className="primary" onClick={()=>setCash(true)}>+ Add cash expense</button>
    </div>

    {emptyPeriod&&<div className="period-empty card">
      <div>
        <b>No transactions for {scopeLabel} in {period.label}</b>
        <span>Try another family view or a wider period.</span>
      </div>
      {period.key!=='all'&&<button className="secondary" onClick={()=>setPeriodKey('all')}>Show all dates</button>}
    </div>}

    <section className="hero">
      <div>
        <small>AVAILABLE • {scopeLabel.toUpperCase()}</small>
        <div className="hero-money">{money(s.available)}</div>
        <p>Income − Spent for {period.label}</p>
      </div>

      <div className="metric-grid">
        <div className="metric"><small>INCOME</small><b>{money(s.income)}</b><span>Total qualifying inflows</span></div>
        <div className="metric"><small>SPENT</small><b>{money(s.spent)}</b><span>Internal transfers excluded</span></div>
      </div>

      <div className="verify">
        <div><b>{pct}% verified</b><span>{s.verified} of {s.total} ledger items verified</span></div>
        <div className="bar"><i style={{width:`${pct}%`}}/></div>
        <a href="/import">Review {s.needs_review} items →</a>
      </div>
    </section>

    <div className="grid2">
      <section className="card">
        <div className="row between"><div><small>REAL DATA</small><h2>Cash Flow</h2></div></div>
        {s.cashflow.some(x=>x.income||x.spent)
          ? <div className="flow-bars">{s.cashflow.map(m=>
              <div className="flow-month" key={m.label}>
                <div className="flow-pair">
                  <i className="income" style={{height:`${Math.max(2,m.income/maxFlow*150)}px`}} title={`Income ${money(m.income)}`}/>
                  <i className="spent" style={{height:`${Math.max(2,m.spent/maxFlow*150)}px`}} title={`Spent ${money(m.spent)}`}/>
                </div>
                <small>{m.label}</small>
              </div>
            )}</div>
          : <div className="empty">Cash-flow history will appear after you import or add transactions.</div>}
      </section>

      <section className="card">
        <div className="row between"><h2>Spending by Family</h2><small>{period.label}</small></div>
        {s.family_spending.length
          ? <div className="family-spending">{s.family_spending.map(member=>
              <div key={member.id??'self'}>
                <div className="row between">
                  <span><b>{member.name}</b><small>{member.handle}</small></span>
                  <b>{money(member.amount)}</b>
                </div>
                <div className="bar"><i style={{width:`${Math.min(100,member.amount/familyMax*100)}%`}}/></div>
              </div>
            )}</div>
          : <div className="empty">No family spending in this period yet.</div>}
      </section>
    </div>

    <div className="grid2">
      <section className="card">
        <div className="row between"><h2>Recent Transactions</h2><a href="/transactions">View all</a></div>
        {tx.length
          ? <div className="tx-list">{tx.map(t=>
              <div className="tx" key={t.id}>
                <div>
                  <strong>{t.merchant||t.description||'Transaction'}</strong>
                  <span>{t.category} • {t.account}</span>
                  <div className="tx-pills">
                    {t.user&&<em className="family-pill">{t.user.name} • {t.user.handle}</em>}
                    {upiLabel(t)&&<em className="source-pill">{upiLabel(t)}</em>}
                  </div>
                </div>
                <div className={t.direction==='credit'?'pos':''}>
                  <b>{t.direction==='credit'?'+':'-'}{money(t.amount)}</b>
                  <small>{t.verification_status.replace('_',' ')}</small>
                </div>
              </div>
            )}</div>
          : <div className="empty">
              No transactions in {period.label}.
              {period.key!=='all'&&<button className="inline-link" onClick={()=>setPeriodKey('all')}> Show all dates</button>}
            </div>}
      </section>

      <section className="card">
        <div className="row between"><h2>Spending by Category</h2><b>{money(s.spent)}</b></div>
        {s.categories.length
          ? <div className="cats">{s.categories.slice(0,6).map(c=>
              <div key={c.name}>
                <div className="row between"><span>{c.name}</span><b>{money(c.amount)}</b></div>
                <div className="bar"><i style={{width:`${Math.min(100,c.amount/(s.spent||1)*100)}%`}}/></div>
              </div>
            )}</div>
          : <div className="empty">No spending in this period.</div>}
      </section>
    </div>

    <QuickCash open={cash} onClose={()=>setCash(false)} onSaved={load}/>
  </>
}
