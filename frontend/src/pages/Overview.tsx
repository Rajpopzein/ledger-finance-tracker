import {useEffect,useState} from 'react'
import {api} from '../api/client'
import QuickCash from '../components/QuickCash'
import type {Summary,Tx} from '../types'
import {usePeriod} from '../period'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

export default function Overview(){
  const {period,setPeriodKey}=usePeriod()
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
        api.summary(period.from,period.to),
        api.transactions('',period.from,period.to)
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

  useEffect(()=>{load()},[period.from,period.to])

  if(loading)return <div className="dashboard-state card">
    <div className="upload-spinner" aria-hidden="true"/>
    <div><b>Loading your ledger…</b><span>Fetching {period.label} transactions and summary.</span></div>
  </div>

  if(error)return <div className="dashboard-state card error-state">
    <div><b>Could not load the dashboard</b><span>{error}</span></div>
    <button className="secondary" onClick={load}>Try again</button>
  </div>

  if(!s)return null

  const pct=s.total?Math.round(s.verified/s.total*1000)/10:0
  const maxFlow=Math.max(1,...s.cashflow.flatMap(x=>[x.income,x.spent]))
  const emptyPeriod=s.total===0

  return <>
    <div className="page-head">
      <div><small>{period.label.toUpperCase()}</small><h1>Good evening, Raj</h1></div>
      <button className="primary" onClick={()=>setCash(true)}>+ Add cash expense</button>
    </div>

    {emptyPeriod&&<div className="period-empty card">
      <div>
        <b>No transactions in {period.label}</b>
        <span>Your ledger may contain transactions outside this selected period.</span>
      </div>
      {period.key!=='all'&&<button className="secondary" onClick={()=>setPeriodKey('all')}>Show all data</button>}
    </div>}

    <section className="hero">
      <div>
        <small>AVAILABLE</small>
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
        <div className="row between"><h2>Needs attention</h2><b className="warn">{s.needs_review}</b></div>
        <p>Only items that actually need your decision.</p>
        {s.needs_review
          ? <div className="attention">Possible duplicate / classification review</div>
          : <div className="muted">Nothing needs review.</div>}
        <a href="/import" className="secondary">Review items</a>
      </section>
    </div>

    <div className="grid2">
      <section className="card">
        <div className="row between"><h2>Recent Transactions</h2><a href="/transactions">View all</a></div>
        {tx.length
          ? <div className="tx-list">{tx.map(t=>
              <div className="tx" key={t.id}>
                <div><strong>{t.merchant||t.description||'Transaction'}</strong><span>{t.category} • {t.account}</span>{upiLabel(t)&&<em className="source-pill">{upiLabel(t)}</em>}</div>
                <div className={t.direction==='credit'?'pos':''}>
                  <b>{t.direction==='credit'?'+':'-'}{money(t.amount)}</b>
                  <small>{t.verification_status.replace('_',' ')}</small>
                </div>
              </div>
            )}</div>
          : <div className="empty">
              No transactions in {period.label}.
              {period.key!=='all'&&<button className="inline-link" onClick={()=>setPeriodKey('all')}> Show all data</button>}
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
