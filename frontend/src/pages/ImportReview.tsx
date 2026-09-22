import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {api} from '../api/client'
import UPIImport from '../components/UPIImport'

type ImportStage='idle'|'uploading'|'committing'|'reprocessing'

export default function ImportReview(){
  const [accounts,setAccounts]=useState<any[]>([])
  const [account,setAccount]=useState<number|undefined>()
  const [preview,setPreview]=useState<any>(null)
  const [stage,setStage]=useState<ImportStage>('idle')
  const [error,setError]=useState('')
  const [fileName,setFileName]=useState('')
  const [selectedFile,setSelectedFile]=useState<File|null>(null)
  const [mode,setMode]=useState<'bank'|'upi'>('bank')

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
    setSelectedFile(file)
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

  async function reprocess(){
    if(!account||!selectedFile)return
    setStage('reprocessing')
    setError('')
    try{
      const r=await api.reprocess(account,selectedFile)
      setPreview({...preview,reprocessed:r})
    }catch(e:any){
      setError(e.message||'Could not reprocess this statement.')
    }finally{
      setStage('idle')
    }
  }

  return <>
    <div className="page-head">
      <div>
        <small>SAFE IMPORT</small>
        <h1>Import transactions</h1>
        <p>Reconcile bank statements and UPI app history without creating duplicate expenses.</p>
      </div>
    </div>

    <div className="import-tabs" role="tablist" aria-label="Import source">
      <button className={mode==='bank'?'active':''} onClick={()=>setMode('bank')}>Bank statement</button>
      <button className={mode==='upi'?'active':''} onClick={()=>setMode('upi')}>UPI apps</button>
    </div>

    {mode==='upi'
      ? <UPIImport accounts={accounts}/>
      : <div className="gridImport">
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
                        <span>{fileName?fileName:'CSV, XLSX or XLS'}</span>
                        <small>{fileName?'Select a file to replace the current selection.':'Ledger will preview transactions before importing anything.'}</small>
                      </>
                  }

                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
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
            ? <>
                {preview.reprocessed
                  ? <div className="success">
                      Reprocessed {preview.reprocessed.replaced} transactions.
                      {' '}{preview.reprocessed.debits} debits and {preview.reprocessed.credits} credits are now mapped from the statement.
                    </div>
                  : <>
                      {typeof preview.detected==='number'&&<div className="preview-grid direction-preview">
                        <div><small>FOUND</small><b>{preview.detected}</b></div>
                        <div><small>DEBITS</small><b>{preview.debits??0}</b></div>
                        <div><small>CREDITS</small><b>{preview.credits??0}</b></div>
                      </div>}
                      <div className="attention">
                        This exact statement was already imported. Review the debit/credit counts above, then reprocess to replace the old mapping.
                      </div>
                      <button className="primary" onClick={reprocess} disabled={busy||!selectedFile}>
                        {stage==='reprocessing'?'Reprocessing statement…':'Reprocess statement'}
                      </button>
                      {stage==='reprocessing'&&
                        <div className="commit-status">
                          <div className="upload-spinner small" aria-hidden="true"/>
                          Rebuilding transactions from the corrected Dr/Cr mapping…
                        </div>
                      }
                    </>
                }
              </>
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
    </div>}
  </>
}
