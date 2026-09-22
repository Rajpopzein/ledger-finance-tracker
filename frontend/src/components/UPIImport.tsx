import {useState} from 'react'
import {api} from '../api/client'

type Props={accounts:any[]}

export default function UPIImport({accounts}:Props){
  const [account,setAccount]=useState<number|undefined>(accounts[0]?.id)
  const [app,setApp]=useState('google_pay')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState<'idle'|'preview'|'commit'>('idle')
  const [error,setError]=useState('')

  async function inspect(selected:File){
    const accountId=account||accounts[0]?.id
    if(!accountId)return
    setFile(selected)
    setPreview(null)
    setError('')
    setBusy('preview')
    try{
      setPreview(await api.upiPreview(accountId,app,selected))
    }catch(e:any){
      setError(e.message||'Could not read this UPI export.')
    }finally{
      setBusy('idle')
    }
  }

  async function commit(){
    const accountId=account||accounts[0]?.id
    if(!accountId||!file)return
    setBusy('commit')
    setError('')
    try{
      const result=await api.upiCommit(accountId,app,file)
      setPreview({...preview,committed:result})
    }catch(e:any){
      setError(e.message||'Could not import this UPI history.')
    }finally{
      setBusy('idle')
    }
  }

  if(!accounts.length){
    return <div className="card empty">
      Add an account in Settings first. UPI imports can be linked to any active Ledger account.
    </div>
  }

  return <div className="gridImport">
    <section>
      <div className="card upload">
        <label>
          UPI app
          <select value={app} disabled={busy!=='idle'} onChange={e=>{setApp(e.target.value);setPreview(null);setFile(null)}}>
            <option value="google_pay">Google Pay</option>
            <option value="phonepe">PhonePe</option>
          </select>
        </label>

        <label>
          Linked account
          <select value={account||accounts[0]?.id||''} disabled={busy!=='idle'} onChange={e=>{setAccount(Number(e.target.value));setPreview(null);setFile(null)}}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className={`drop ${busy==='preview'?'drop-busy':''}`}>
          {busy==='preview'
            ? <>
                <div className="upload-spinner" aria-hidden="true"/>
                <b>Checking UPI history…</b>
                <span>{file?.name}</span>
                <div className="upload-progress"><i/></div>
                <small>Ledger is checking UPI/UTR IDs and existing transactions on the selected account.</small>
              </>
            : <>
                <b>{file?'Choose another export':'Choose UPI export'}</b>
                <span>{file?.name||'CSV, XLSX, XLS, JSON or PDF'}</span>
                <small>Successful transactions only. Failed and pending payments are ignored.</small>
              </>
          }
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.pdf"
            disabled={busy!=='idle'}
            onChange={e=>{
              const selected=e.target.files?.[0]
              if(selected)inspect(selected)
              e.currentTarget.value=''
            }}
          />
        </label>
      </div>

      {error&&<div className="attention">{error}</div>}

      {preview&&<div className="card">
        <div className="row between">
          <div>
            <small>UPI IMPORT</small>
            <h2>{preview.app}</h2>
          </div>
          {file&&<span className="import-file-name">{file.name}</span>}
        </div>

        <div className="preview-grid upi-preview-grid">
          <div><small>FOUND</small><b>{preview.detected||0}</b></div>
          <div><small>NEW</small><b>{preview.new||0}</b></div>
          <div><small>EXISTING</small><b>{preview.existing||0}</b></div>
          <div><small>REVIEW</small><b>{preview.review||0}</b></div>
        </div>

        <div className="direction-summary">
          <span>{preview.debits||0} debits</span>
          <span>{preview.credits||0} credits</span>
        </div>

        {preview.already_imported
          ? <div className="attention">This exact {preview.app} export has already been imported.</div>
          : preview.committed
            ? <div className="success">
                {preview.committed.inserted} new transactions added, {preview.committed.linked} existing transactions linked to {preview.committed.app}, and {preview.committed.review} left for review.
              </div>
            : <>
                <p className="muted">
                  Existing matches are linked to {preview.app} as another source. Ledger creates a new transaction only when no safe match exists.
                </p>
                <button className="primary" onClick={commit} disabled={busy!=='idle'||!file}>
                  {busy==='commit'?'Importing…':`Import ${preview.new||0} new + link ${preview.existing||0}`}
                </button>
                {busy==='commit'&&<div className="commit-status">
                  <div className="upload-spinner small" aria-hidden="true"/>
                  Reconciling UPI history with your ledger…
                </div>}
              </>
        }
      </div>}
    </section>

    <aside className="card">
      <h2>UPI reconciliation</h2>
      <div className="steps">
        <div><b>1</b><span>Read successful Google Pay / PhonePe transactions</span></div>
        <div><b>2</b><span>Match UPI transaction ID, UTR or RRN</span></div>
        <div><b>3</b><span>Check the selected account, amount, date and direction</span></div>
        <div><b>4</b><span>Attach the UPI app label to existing transactions</span></div>
        <div><b>5</b><span>Create only transactions that are genuinely missing</span></div>
      </div>
      <p className="muted">
        Searchable PDF statements are supported. Image-only/scanned PDFs are rejected instead of being OCRed automatically. Amount/date-only matches are not merged automatically; ambiguous matches stay in Review.
      </p>
    </aside>
  </div>
}
