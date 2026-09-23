import {useEffect,useState} from 'react'
import {Link as RouterLink} from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import {api} from '../api/client'
import {useAppData} from '../appData'
import {claySx,useUI} from '../ui'
import ExcelPasswordDialog from './ExcelPasswordDialog'

type ImportStage='idle'|'uploading'|'committing'|'reprocessing'

const passwordMessage=(message:string)=>{
  if(message==='EXCEL_PASSWORD_REQUIRED')return ''
  if(message==='EXCEL_PASSWORD_INVALID')return 'Incorrect password. Try again.'
  return null
}

export default function BankImport(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const {accounts:allAccounts}=useAppData()
  const accounts=allAccounts.filter((x:any)=>x.type==='bank')

  const [account,setAccount]=useState<number|undefined>()
  const [preview,setPreview]=useState<any>(null)
  const [stage,setStage]=useState<ImportStage>('idle')
  const [error,setError]=useState('')
  const [fileName,setFileName]=useState('')
  const [selectedFile,setSelectedFile]=useState<File|null>(null)
  const [password,setPassword]=useState('')
  const [passwordOpen,setPasswordOpen]=useState(false)
  const [passwordError,setPasswordError]=useState('')

  const busy=stage!=='idle'

  useEffect(()=>{
    if(account&&accounts.some((x:any)=>x.id===account))return
    setAccount(accounts[0]?.id)
  },[allAccounts,account])

  function handleProtectedExcel(message:string){
    const promptError=passwordMessage(message)
    if(promptError===null)return false
    setError('')
    setPasswordError(promptError)
    setPasswordOpen(true)
    return true
  }

  async function loadPreview(file:File,filePassword=''){
    if(!account)return
    setStage('uploading')
    setPreview(null)
    setError('')
    try{
      const result=await api.preview(account,file,filePassword||undefined)
      setPreview(result)
      setPasswordOpen(false)
      setPasswordError('')
    }catch(e:any){
      if(!handleProtectedExcel(e?.message||'')){
        setError(e.message||'Could not parse this statement.')
      }
    }finally{
      setStage('idle')
    }
  }

  async function pick(file:File){
    setFileName(file.name)
    setSelectedFile(file)
    setPassword('')
    setPasswordOpen(false)
    setPasswordError('')
    await loadPreview(file,'')
  }

  async function unlockFile(){
    if(!selectedFile||!password)return
    await loadPreview(selectedFile,password)
  }

  async function commit(){
    if(!account||!selectedFile)return
    setStage('committing')
    setError('')
    try{
      const r=await api.bankCommit(account,selectedFile,password||undefined)
      setPreview({...preview,committed:r})
      setPassword('')
      setPasswordOpen(false)
      setPasswordError('')
    }catch(e:any){
      if(!handleProtectedExcel(e?.message||'')){
        setError(e.message||'Could not import this statement.')
      }
    }finally{
      setStage('idle')
    }
  }

  async function reprocess(){
    if(!account||!selectedFile)return
    setStage('reprocessing')
    setError('')
    try{
      const r=await api.reprocess(account,selectedFile,password||undefined)
      setPreview({...preview,reprocessed:r})
      setPassword('')
      setPasswordOpen(false)
      setPasswordError('')
    }catch(e:any){
      if(!handleProtectedExcel(e?.message||'')){
        setError(e.message||'Could not reprocess this statement.')
      }
    }finally{
      setStage('idle')
    }
  }

  return <>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 340px'},gap:{xs:1.15,sm:2}}}>
      <Stack spacing={{xs:1.5,sm:2}}>
        <Paper sx={{...clay,p:{xs:1.4,sm:2.1}}}>
          {accounts.length?<Stack spacing={1.6}>
            <FormControl size="small">
              <InputLabel>Bank account</InputLabel>
              <Select
                label="Bank account"
                value={account||''}
                disabled={busy}
                onChange={e=>setAccount(Number(e.target.value))}
              >
                {accounts.map(a=><MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </Select>
            </FormControl>

            <Button
              component="label"
              variant="outlined"
              startIcon={<CloudUploadRoundedIcon/>}
              disabled={busy}
              sx={{minHeight:{xs:92,sm:110},borderStyle:'dashed',display:'flex',flexDirection:'column',gap:.5}}
            >
              <Typography fontWeight={750}>{stage==='uploading'?'Uploading & checking…':fileName?'Choose another statement':'Choose statement'}</Typography>
              <Typography variant="caption" color="text.secondary">{fileName||'CSV, XLSX or XLS'}</Typography>
              <input
                hidden
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e=>{
                  const file=e.target.files?.[0]
                  if(file)pick(file)
                  e.currentTarget.value=''
                }}
              />
            </Button>
          </Stack>:<Alert severity="info" action={<Button component={RouterLink} to="/profile?tab=settings">Settings</Button>}>
            Add a bank account before importing a bank statement.
          </Alert>}
        </Paper>

        {error&&<Alert severity="error">{error}</Alert>}

        {preview&&<Paper sx={{...clay,p:{xs:1.4,sm:2.1}}}>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1} sx={{mb:2}}>
            <Typography variant="h2">Import preview</Typography>
            {fileName&&<Chip label={fileName} variant="outlined" sx={{maxWidth:{xs:'100%',sm:280}}}/>}
          </Stack>

          {preview.already_imported?<>
            {preview.reprocessed
              ? <Alert severity="success">Reprocessed {preview.reprocessed.replaced} transactions. {preview.reprocessed.debits} debits and {preview.reprocessed.credits} credits are now mapped from the statement.</Alert>
              : <Stack spacing={1.5}>
                  {typeof preview.detected==='number'&&<Box sx={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1}}>
                    {[
                      ['FOUND',preview.detected],
                      ['DEBITS',preview.debits??0],
                      ['CREDITS',preview.credits??0]
                    ].map(([label,value])=><Paper variant="outlined" key={String(label)} sx={{p:1.2,borderRadius:1.5}}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="h2">{value}</Typography>
                    </Paper>)}
                  </Box>}
                  <Alert severity="warning">This exact statement was already imported. Review the debit/credit counts, then reprocess to replace the old mapping.</Alert>
                  <Button startIcon={<RestartAltRoundedIcon/>} variant="contained" onClick={reprocess} disabled={busy||!selectedFile}>
                    {stage==='reprocessing'?'Reprocessing…':'Reprocess statement'}
                  </Button>
                </Stack>}
          </>:<>
            <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',sm:'repeat(4,1fr)'},gap:1.5,mb:1.5}}>
              {[
                ['FOUND',preview.detected],
                ['NEW',preview.new],
                ['MATCHED',preview.matched],
                ['REVIEW',preview.review]
              ].map(([label,value])=><Paper variant="outlined" key={String(label)} sx={{p:1.2,borderRadius:1.5}}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h2">{value}</Typography>
              </Paper>)}
            </Box>

            {preview.committed
              ? <Alert severity="success">
                  {preview.committed.already_imported
                    ? 'This exact statement is already in your ledger. Nothing new was added.'
                    : `Imported ${preview.committed.inserted} new transactions and verified ${preview.committed.matched} existing records.`}
                </Alert>
              : <Button variant="contained" onClick={commit} disabled={busy||!selectedFile}>
                  {stage==='committing'?'Adding transactions…':`Add ${preview.new} new transactions`}
                </Button>}
          </>}
        </Paper>}
      </Stack>

      <Paper sx={{...clay,p:{xs:1.4,sm:2},height:'fit-content'}}>
        <Typography variant="h2">Duplicate protection</Typography>
        <Stack spacing={1.5} sx={{mt:1.6}}>
          {[
            'Normalize statement rows',
            'Match bank/UPI references',
            'Check deterministic fingerprint',
            'Send uncertain matches to review',
            'Add only genuinely new ledger entries',
          ].map((step,index)=><Stack key={step} direction="row" spacing={1.1} alignItems="flex-start">
            <Chip size="small" label={index+1} color="primary"/>
            <Typography variant="body2">{step}</Typography>
          </Stack>)}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>
          The same transaction can appear in multiple sources without becoming multiple expenses.
        </Typography>
      </Paper>
    </Box>

    <ExcelPasswordDialog
      open={passwordOpen}
      fileName={fileName}
      password={password}
      busy={stage==='uploading'}
      error={passwordError}
      onPasswordChange={value=>{setPassword(value);setPasswordError('')}}
      onSubmit={unlockFile}
      onCancel={()=>{
        if(stage==='uploading')return
        setPasswordOpen(false)
        setPassword('')
        setPasswordError('')
      }}
    />
  </>
}
