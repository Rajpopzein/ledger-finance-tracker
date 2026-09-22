import {useEffect,useState} from 'react'
import {api} from '../api/client'
import type {Tx} from '../types'
import {usePeriod} from '../period'
import {useFamily} from '../family'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

export default function Transactions(){
  const {period,setPeriodKey}=usePeriod()
  const {familyScope,familyMemberId,scopeLabel,members}=useFamily()
  const [q,setQ]=useState('')
  const [items,setItems]=useState<Tx[]>([])
  const [selected,setSelected]=useState<Tx|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)
  const [tagging,setTagging]=useState(false)

  useEffect(()=>{
    const t=setTimeout(async()=>{
      setLoading(true)
      setError('')
      try{
        const x=await api.transactions(q,period.from,period.to,familyScope,familyMemberId)
        setItems(x)
        setSelected(prev=>x.find(i=>i.id===prev?.id)||x[0]||null)
      }catch(e:any){
        setItems([])
        setSelected(null)
        setError(e.message||'Could not load transactions.')
      }finally{
        setLoading(false)
      }
    },200)
    return()=>clearTimeout(t)
  },[q,period.from,period.to,familyScope,familyMemberId,refresh])

  async function assignFamily(value:string){
    if(!selected||tagging)return
    setTagging(true)
    setError('')
    try{
      await api.tagTransactionFamily(selected.id,value?Number(value):null)
      setRefresh(x=>x+1)
    }catch(e:any){
      setError(e.message||'Could not update family tag.')
    }finally{
      setTagging(false)
    }
  }

  return <>
    <div className="page-head">
      <div><small>{period.label.toUpperCase()} • {scopeLabel.toUpperCase()}</small><h1>Transactions</h1></div>
    </div>

    <div className="search">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search transactions, merchants or references…"/>
    </div>

    {loading&&<div className="dashboard-state card">
      <div className="upload-spinner small" aria-hidden="true"/>
      <div><b>Loading transactions…</b><span>Checking {period.label} • {scopeLabel}.</span></div>
    </div>}

    {error&&<div className="dashboard-state card error-state">
      <div><b>Could not load transactions</b><span>{error}</span></div>
    </div>}

    {!loading&&!error&&<div className="ledger-wrap">
      <section className="ledger">
        <div className="thead">
          <span>Merchant</span><span>Category</span><span>Account</span><span>Date</span><span className="right">Amount</span><span>Status</span>
        </div>

        {items.length
          ? items.map(t=>
              <button key={t.id} onClick={()=>setSelected(t)} className={`trow ${selected?.id===t.id?'selected':''}`}>
                <span>
                  <b>{t.merchant||'Transaction'}</b>
                  <small>{t.txn_type.replace('_',' ')}</small>
                  <div className="tx-pills">
                    {t.family_member&&<em className="family-pill">{t.family_member.name}</em>}
                    {upiLabel(t)&&<em className="source-pill">{upiLabel(t)}</em>}
                  </div>
                </span>
                <span>{t.category}</span>
                <span>{t.account}<small>{t.payment_method||''}</small></span>
                <span>{new Date(t.txn_at).toLocaleDateString('en-IN')}</span>
                <span className={`right ${t.direction==='credit'?'pos':''}`}>{t.direction==='credit'?'+':'-'}{money(t.amount)}</span>
                <span className="badge">{t.verification_status.replace('_',' ')}</span>
              </button>
            )
          : <div className="empty ledger-empty">
              <b>No transactions for {scopeLabel} in {period.label}.</b>
              {period.key!=='all'&&<div style={{marginTop:10}}><button className="secondary" onClick={()=>setPeriodKey('all')}>Show all dates</button></div>}
            </div>}
      </section>

      {selected&&<aside className="detail">
        <small>TRANSACTION DETAILS</small>
        <div className="row between">
          <div><h2>{selected.merchant||'Transaction'}</h2><span>{new Date(selected.txn_at).toLocaleString('en-IN')}</span></div>
          <h2>{money(selected.amount)}</h2>
        </div>

        <div className="detail-grid">
          <div><small>Category</small><b>{selected.category}</b></div>
          <div><small>Account</small><b>{selected.account}</b></div>
        </div>

        <div className="detail-block">
          <small>FAMILY TAG</small>
          <label className="family-tag-field">
            <select
              value={selected.family_member?.id||''}
              disabled={tagging}
              onChange={e=>assignFamily(e.target.value)}
            >
              <option value="">Self</option>
              {members.map(member=><option key={member.id} value={member.id}>{member.name} • {member.member_code}</option>)}
            </select>
          </label>
          <span className="muted">{tagging?'Updating family tag…':'Untagged transactions belong to Self.'}</span>
        </div>

        <div className="detail-block">
          <small>STATUS</small>
          <div className="source"><b>{selected.verification_status.replace('_',' ')}</b></div>
        </div>

        <div className="detail-block">
          <small>SOURCES</small>
          {selected.sources.map((s,i)=><div className="source" key={i}><b>{s.name}</b><span>{s.type.toUpperCase()}</span></div>)}
        </div>

        <details><summary>Advanced details</summary><pre>{selected.description||'No raw description'}</pre></details>
      </aside>}
    </div>}
  </>
}
