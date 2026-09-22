import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {api} from '../api/client'

type ImportStage='idle'|'uploading'|'committing'

export default function ImportReview(){
  const [accounts,setAccounts]=useState<any[]>([])
  const [account,setAccount]=useState<number|undefined>()
  const [preview,setPreview]=useState<any>(null)
  const [stage,setStage]=useState<ImportStage>('idle')
  const [error,setError]=useState('')
  const [fileName,setFileName]=useState('')

  const busy=stage!=='idle'

  useEffect(()=>{
    api.accounts().then(a=>{
      const banks=a.filter((x:any)=>x.type==='bank')
      setAccounts(banks)
      setAccount(banks[0]?.id)
    })
  },[])

  async function pick(file:File){
    if(!account)return
    setStage('uploading')
    setFileName(file.name)
    setPreview(null)
    setError('')
    try{
      setPreview(await api.preview(account,file))
    }catch(e:any){
      setError(e.message||'Could not parse this statement.')
    }finally{
      setStage('idle')
    }
  }

  async function commit(){
    if(!preview?.preview_token)return
    setStage('committing')
    setError('')
    try{
      const r=await api.commit(preview.preview_token)
      setPreview({...preview,committed:r})
    }catch(e:any){
      setError(e.message||'Could not import this statement.')
    }finally{
      setStage('idle')
    }
  }

  return <>
    <div className="page-head">
      <div>
        <small>SAFE IMPORT</small>
        <h1>Import bank statement</h1>
        <p>CSV and XLSX only in v1. We validate duplicates before anything enters the ledger.</p>
      </div>
    </div>

    <div className="gridImport">
      <section>
        <div className="upload card">
          {accounts.length
            ? <>
                <select value={account||''} disabled={busy} onChange={e=>setAccount(Number(e.target.value))}>
                  {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>

                <label className={`drop ${stage==='uploading'?'drop-busy':''}`}>
                  {stage==='uploading'
                    ? <>
                        <div className="upload-spinner" aria-hidden="true"/>
                        <b>Uploading & checking statement…</b>
                        <span>{fileName}</span>
                        <div className="upload-progress" aria-label="Upload in progress"><i/></div>
                        <small>Please keep this page open while Ledger validates the file.</small>
                      </>
                    : <>
                        <b>{fileName?'Choose another statement':'Choose statement'}</b>
                        <span>{fileName?fileName:'CSV or XLSX'}</span>
                        <small>{fileName?'Select a file to replace the current selection.':'Ledger will preview transactions before importing anything.'}</small>
                      </>
                  }

                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    disabled={busy}
                    onChange={e=>{
                      const file=e.target.files?.[0]
                      if(file)pick(file)
                      e.currentTarget.value=''
                    }}
                  />
                </label>
              </>
            : <div className="empty">
                <b>No bank account configured.</b><br/>
                Add your bank account in Settings before importing a statement.
                <div style={{marginTop:14}}>
                  <Link className="secondary" to="/settings">Open Settings</Link>
                </div>
              </div>
          }
        </div>

        {error&&<div className="attention">{error}</div>}

        {preview&&<div className="card">
          <div className="row between">
            <h2>Import preview</h2>
            {fileName&&<span className="import-file-name">{fileName}</span>}
          </div>

          {preview.already_imported
            ? <div className="attention">This exact statement was already imported. Nothing will be added.</div>
            : <>
                <div className="preview-grid">
                  <div><small>FOUND</small><b>{preview.detected}</b></div>
                  <div><small>NEW</small><b>{preview.new}</b></div>
                  <div><small>MATCHED</small><b>{preview.matched}</b></div>
                  <div><small>REVIEW</small><b>{preview.review}</b></div>
                </div>

                {preview.committed
                  ? <div className="success">Imported {preview.committed.inserted} new transactions and verified {preview.committed.matched} existing records.</div>
                  : <>
                      <button className="primary" onClick={commit} disabled={busy}>
                        {stage==='committing'?'Adding transactions…':`Add ${preview.new} new transactions`}
                      </button>
                      {stage==='committing'&&
                        <div className="commit-status">
                          <div className="upload-spinner small" aria-hidden="true"/>
                          Saving transactions to your ledger…
                        </div>
                      }
                    </>
                }
              </>
          }
        </div>}
      </section>

      <aside className="card">
        <h2>Duplicate protection</h2>
        <div className="steps">
          <div><b>1</b><span>Normalize statement rows</span></div>
          <div><b>2</b><span>Match bank/UPI references</span></div>
          <div><b>3</b><span>Check deterministic fingerprint</span></div>
          <div><b>4</b><span>Send uncertain matches to review</span></div>
          <div><b>5</b><span>Add only genuinely new ledger entries</span></div>
        </div>
        <p className="muted">The same transaction can appear in multiple sources without becoming multiple expenses.</p>
      </aside>
    </div>
  </>
}
