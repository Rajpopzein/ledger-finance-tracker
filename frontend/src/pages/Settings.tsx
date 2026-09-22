import {useEffect,useState} from 'react'
import {api} from '../api/client'
import {useFamily} from '../family'

export default function Settings(){
  const {members,refreshMembers}=useFamily()
  const [s,setS]=useState<any>({
    provider:'',base_url:'',model:'',api_key:'',context_limit:'',temperature:0.2,
    allow_amounts:true,allow_merchants:true,allow_categories:true,allow_dates:true,
    allow_balances:false,allow_notes:false
  })
  const [msg,setMsg]=useState('')
  const [accounts,setAccounts]=useState<any[]>([])
  const [acc,setAcc]=useState({institution:'',account_mask:'',name:''})
  const [family,setFamily]=useState({name:'',member_code:''})
  const [familyMsg,setFamilyMsg]=useState('')

  const loadAccounts=()=>api.accounts().then(setAccounts)

  useEffect(()=>{
    api.aiSettings().then(x=>setS((p:any)=>({...p,...x,provider:x.provider||''})))
    loadAccounts()
    refreshMembers()
  },[])

  async function save(){
    await api.saveAI({...s,context_limit:s.context_limit?Number(s.context_limit):null,provider:s.provider||null})
    setMsg('Saved locally.')
  }

  async function addAccount(){
    if(!acc.institution.trim())return
    await api.createAccount({...acc,type:'bank'})
    setAcc({institution:'',account_mask:'',name:''})
    loadAccounts()
  }

  async function addFamilyMember(){
    if(!family.name.trim()||!family.member_code.trim())return
    const result=await api.createFamilyMember({
      name:family.name.trim(),
      member_code:family.member_code.trim()
    })
    setFamily({name:'',member_code:''})
    setFamilyMsg(`${result.name} added with ID ${result.member_code}.`)
    await refreshMembers()
  }

  return <>
    <div className="page-head">
      <div><small>CONFIGURATION</small><h1>Settings</h1></div>
    </div>

    <div className="grid2">
      <section className="card">
        <h2>Bank accounts</h2>
        <p>Add only the accounts whose statements you want to import.</p>
        {accounts.filter(a=>a.type==='bank').length
          ? <div className="account-list">{accounts.filter(a=>a.type==='bank').map(a=>
              <div className="source" key={a.id}><b>{a.name}</b><span>{a.institution}</span></div>
            )}</div>
          : <div className="empty">No bank accounts added yet.</div>}

        <label>Bank / institution
          <input value={acc.institution} placeholder="e.g. HDFC" onChange={e=>setAcc({...acc,institution:e.target.value})}/>
        </label>
        <label>Last 4 digits (optional)
          <input value={acc.account_mask} maxLength={8} placeholder="1234" onChange={e=>setAcc({...acc,account_mask:e.target.value.replace(/\D/g,'')})}/>
        </label>
        <label>Display name (optional)
          <input value={acc.name} placeholder="HDFC Salary" onChange={e=>setAcc({...acc,name:e.target.value})}/>
        </label>
        <button className="primary" onClick={addAccount} disabled={!acc.institution.trim()}>Add bank account</button>
      </section>

      <section className="card">
        <h2>Family members</h2>
        <p>Add a member once, then tag their transactions from Transaction Details.</p>

        {members.length
          ? <div className="account-list">{members.map(member=>
              <div className="source" key={member.id}>
                <b>{member.name}</b>
                <span>ID {member.member_code}</span>
              </div>
            )}</div>
          : <div className="empty">No family members added yet.</div>}

        <label>Member name
          <input value={family.name} placeholder="e.g. Wife" onChange={e=>setFamily({...family,name:e.target.value})}/>
        </label>
        <label>Member ID
          <input value={family.member_code} placeholder="e.g. FAMILY-002" onChange={e=>setFamily({...family,member_code:e.target.value})}/>
        </label>
        <button className="primary" onClick={addFamilyMember} disabled={!family.name.trim()||!family.member_code.trim()}>
          Add family member
        </button>
        {familyMsg&&<span className="success">{familyMsg}</span>}
      </section>
    </div>

    <section className="card settings-ai">
      <h2>AI provider</h2>
      <label>Provider
        <select value={s.provider} onChange={e=>setS({...s,provider:e.target.value})}>
          <option value="">Select provider</option>
          <option value="local">Local / OpenAI-compatible</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>
      {s.provider==='local'&&<label>Base URL
        <input value={s.base_url||''} placeholder="http://localhost:1234/v1" onChange={e=>setS({...s,base_url:e.target.value})}/>
      </label>}
      <label>Model
        <input value={s.model||''} placeholder="Enter model name" onChange={e=>setS({...s,model:e.target.value})}/>
      </label>
      <label>API key
        <input type="password" value={s.api_key||''} placeholder={s.has_api_key?'Stored securely — enter to replace':'Optional for local; required for Gemini'} onChange={e=>setS({...s,api_key:e.target.value})}/>
      </label>
      <div className="form2">
        <label>Context limit
          <input value={s.context_limit||''} placeholder="e.g. 16384" onChange={e=>setS({...s,context_limit:e.target.value})}/>
        </label>
        <label>Temperature
          <input value={s.temperature} onChange={e=>setS({...s,temperature:Number(e.target.value)})}/>
        </label>
      </div>
      <button className="primary" onClick={save}>Save AI settings</button>
      {msg&&<span className="success">{msg}</span>}
    </section>

    <section className="card settings-privacy">
      <h2>AI privacy</h2>
      <p>Sensitive identifiers and raw statements are never included in AI context.</p>
      {[
        ['allow_amounts','Transaction amounts'],
        ['allow_merchants','Merchant names'],
        ['allow_categories','Categories'],
        ['allow_dates','Dates'],
        ['allow_balances','Account balances'],
        ['allow_notes','Notes']
      ].map(([k,l])=><label className="toggle" key={k}>
        <span>{l}</span>
        <input type="checkbox" checked={!!s[k]} onChange={e=>setS({...s,[k]:e.target.checked})}/>
      </label>)}
      <div className="privacy">
        <b>Never sent to cloud AI</b>
        <span>Full account numbers, UPI IDs, bank/UTR references, raw statement files.</span>
      </div>
    </section>
  </>
}
