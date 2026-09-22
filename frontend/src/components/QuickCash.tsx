import {useEffect,useState} from 'react'
import {api} from '../api/client'

const defaults=['Food & Dining','Fuel','Groceries','EMI & Loans','Shopping','Bills & Subscriptions','Travel','Health','Other']

const initialForm=()=>({
  amount:'',
  category:'Food & Dining',
  txn_at:new Date().toISOString().slice(0,16),
  note:''
})

export default function QuickCash({
  open,
  onClose,
  onSaved
}:{
  open:boolean
  onClose:()=>void
  onSaved:()=>void|Promise<void>
}){
  const [cats,setCats]=useState<any[]>([])
  const [form,setForm]=useState(initialForm)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(open){
      setError('')
      api.categories().then(x=>setCats(x.length?x:defaults.map(name=>({name}))))
    }
  },[open])

  if(!open)return null

  async function save(){
    if(saving||!form.amount)return
    setSaving(true)
    setError('')
    try{
      await api.cash({
        ...form,
        amount:Number(form.amount),
        txn_at:new Date(form.txn_at).toISOString()
      })
      await onSaved()
      setForm(initialForm())
      onClose()
    }catch(e:any){
      setError(e.message||'Could not save this cash expense.')
    }finally{
      setSaving(false)
    }
  }

  return <div className="modal-back">
    <div className="modal">
      <div className="row between modal-head">
        <h2>Add cash expense</h2>
        <button className="ghost modal-close" onClick={onClose} disabled={saving}>✕</button>
      </div>

      <label>
        Amount
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.amount}
          disabled={saving}
          onChange={e=>setForm({...form,amount:e.target.value})}
        />
      </label>

      <label>
        Category
        <select
          value={form.category}
          disabled={saving}
          onChange={e=>setForm({...form,category:e.target.value})}
        >
          {cats.map((c:any)=><option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </label>

      <label>
        Date
        <input
          type="datetime-local"
          value={form.txn_at}
          disabled={saving}
          onChange={e=>setForm({...form,txn_at:e.target.value})}
        />
      </label>

      <label>
        Description / note
        <input
          value={form.note}
          disabled={saving}
          onChange={e=>setForm({...form,note:e.target.value})}
        />
      </label>

      {error&&<div className="attention">{error}</div>}

      <button className="primary modal-submit" disabled={!form.amount||saving} onClick={save}>
        {saving?'Saving expense…':'Save expense'}
      </button>

      {saving&&<div className="commit-status">
        <div className="upload-spinner small" aria-hidden="true"/>
        Saving once — duplicate taps are blocked.
      </div>}
    </div>
  </div>
}
