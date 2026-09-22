import {useState} from 'react'
import {api} from '../api/client'

export default function UPIImport(){
  const [app,setApp]=useState('google_pay')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState<'idle'|'preview'|'commit'>('idle')
  const [error,setError]=useState('')

  async function inspect(selected:File){
    setFile(selected)
    setPreview(null)
    setError('')
    setBusy('preview')
    try{
      setPreview(await api.upiPreview(app,selected))
    }catch(e:any){
      setError(e.message||'Could not read this UPI export.')
    }finally{
      setBusy('idle')
    }
  }

  async function commit(){
    if(!file)return
    setBusy('commit')
    setError('')
    try{
      const result=await api.upiCommit(app,file)
      setPreview({...preview,committed:result})
    }catch(e:any){
      setError(e.message||'Could not import this UPI history.')
    }finally{
      setBusy('idle')
    }
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

        <div className="attention upi-account-note">
          No bank account selection is required. Ledger checks every account you own for a matching UPI/UTR transaction.
          If no safe bank match exists, the transaction is stored under <b>UPI • Unassigned</b>.
        </div>

        <label className={`drop ${busy==='preview'?'drop-busy':''}`}>
          {busy==='preview'
            ? <>
                <div className="upload-spinner" aria-hidden="true"/>
                <b>Checking UPI history…</b>
                <span>{file?.name}</span>
                <div className="upload-progress"><i/></div>
                <small>Ledger is reconciling references, amount, date and direction across all your accounts.</small>
              </>
            : <>
                <b>{file?'Choose another export':'Choose UPI export'}</b>
                <span>{file?.name||'CSV, XLSX, XLS, JSON or PDF'}</span>
                <small>Successful transactions only. Failed and pending payments are ignored.</small>
              </>
          }
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"
            disabled={busy!=='idle'}
            onChange={e=>{
              const selected=e.target.files?.[0]
              if(selected){
                const name=selected.name.toLowerCase()
                const allowed=name.endsWith('.csv')||name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.json')||name.endsWith('.pdf')||selected.type==='application/pdf'
                if(!allowed){
                  setError('Unsupported file. Choose CSV, XLSX, XLS, JSON or PDF.')
                }else{
                  inspect(selected)
                }
              }
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
                {preview.committed.inserted>0&&<> New unmatched items are in <b>{preview.committed.fallback_account}</b>.</>}
              </div>
            : <>
                <p className="muted">
                  Existing matches keep their original bank account and gain the {preview.app} source label.
                  Only transactions without a safe match are created under UPI • Unassigned.
                </p>
                <button className="primary" onClick={commit} disabled={busy!=='idle'||!file}>
                  {busy==='commit'?'Importing…':`Import ${preview.new||0} new + link ${preview.existing||0}`}
                </button>
                {busy==='commit'&&<div className="commit-status">
                  <div className="upload-spinner small" aria-hidden="true"/>
                  Reconciling UPI history across your ledger…
                </div>}
              </>
        }
      </div>}
    </section>

    <aside className="card">
      <h2>UPI reconciliation</h2>
      <div className="steps">
        <div><b>1</b><span>Read successful Google Pay / PhonePe transactions</span></div>
        <div><b>2</b><span>Search all your accounts for UPI ID, UTR or RRN</span></div>
        <div><b>3</b><span>Verify amount, date and direction</span></div>
        <div><b>4</b><span>Attach the UPI app label to matching bank transactions</span></div>
        <div><b>5</b><span>Place unmatched transactions in UPI • Unassigned</span></div>
      </div>
      <p className="muted">
        Searchable PDF statements are supported. Image-only/scanned PDFs are rejected instead of being OCRed automatically.
        Amount/date-only matches remain in Review rather than being merged automatically.
      </p>
    </aside>
  </div>
}
