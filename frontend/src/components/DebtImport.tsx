import {useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const empty=()=>({
  lender:'',
  debt_type:'loan',
  principal:'',
  outstanding_balance:'',
  interest_rate:'',
  emi_amount:'',
  start_date:'',
  end_date:'',
  next_due_date:'',
  notes:'',
  source_type:'ai_document',
  source_file_name:'',
})

const isoDate=(value:string)=>value?new Date(value+'T00:00:00').toISOString():null

export default function DebtImport(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const [form,setForm]=useState(empty())
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function analyze(file:File){
    setBusy('preview');setError('');setNotice('');setPreview(null)
    try{
      const result=await api.debtAIPreview(file)
      const p=result.preview||{}
      setPreview(result)
      setForm({
        lender:p.lender||'',
        debt_type:p.debt_type||'loan',
        principal:p.principal!=null?String(p.principal):'',
        outstanding_balance:p.outstanding_balance!=null?String(p.outstanding_balance):p.principal!=null?String(p.principal):'',
        interest_rate:p.interest_rate!=null?String(p.interest_rate):'',
        emi_amount:p.emi_amount!=null?String(p.emi_amount):'',
        start_date:p.start_date||'',
        end_date:p.end_date||'',
        next_due_date:p.next_due_date||'',
        notes:p.notes||'',
        source_type:'ai_document',
        source_file_name:result.file_name||file.name,
      })
      setNotice('AI extracted a draft. Review every field before creating the debt.')
    }catch(e:any){
      setError(e.message||'Could not analyze this loan document.')
    }finally{
      setBusy('')
    }
  }

  async function commit(){
    if(!form.lender.trim()||!form.principal||!form.outstanding_balance)return
    setBusy('commit');setError('');setNotice('')
    try{
      await api.createDebt({
        lender:form.lender.trim(),
        debt_type:form.debt_type||'loan',
        principal:Number(form.principal),
        outstanding_balance:Number(form.outstanding_balance),
        interest_rate:form.interest_rate?Number(form.interest_rate):null,
        emi_amount:form.emi_amount?Number(form.emi_amount):null,
        start_date:isoDate(form.start_date),
        end_date:isoDate(form.end_date),
        next_due_date:isoDate(form.next_due_date),
        status:'active',
        notes:form.notes||null,
        source_type:'ai_document',
        source_file_name:form.source_file_name||null,
      })
      setNotice('Debt created from the reviewed import.')
      setPreview(null)
      setForm(empty())
    }catch(e:any){
      setError(e.message||'Could not create debt.')
    }finally{
      setBusy('')
    }
  }

  return <Stack spacing={1.5}>
    <Paper sx={{...clay,p:{xs:1.5,sm:2.1}}}>
      <Typography variant="h2">Import loan document</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.5,mb:1.5}}>
        Upload a searchable PDF or TXT. Ledger redacts account numbers, IFSC codes, UPI IDs and long identifiers before AI processing.
      </Typography>
      <Button
        component="label"
        variant="outlined"
        startIcon={<CloudUploadRoundedIcon/>}
        disabled={busy==='preview'}
        sx={{minHeight:88,borderStyle:'dashed',width:'100%'}}
      >
        {busy==='preview'?'Analyzing document…':'Choose loan document'}
        <input
          hidden
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={e=>{
            const file=e.target.files?.[0]
            if(file)analyze(file)
            e.currentTarget.value=''
          }}
        />
      </Button>
    </Paper>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    {preview&&<Paper sx={{...clay,p:{xs:1.5,sm:2.1}}}>
      <Typography variant="h2">Review extracted debt</Typography>
      <Alert severity="info" sx={{mt:1,mb:1.5}}>
        Confidence: {Math.round((preview.preview?.confidence||0)*100)}%. Nothing is saved until you confirm.
      </Alert>

      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},
        columnGap:1.5,
        rowGap:1.5,
      }}>
        <TextField label="Lender" value={form.lender} onChange={e=>setForm({...form,lender:e.target.value})}/>
        <TextField label="Debt type" value={form.debt_type} onChange={e=>setForm({...form,debt_type:e.target.value})}/>
        <TextField label="Principal" type="number" value={form.principal} onChange={e=>setForm({...form,principal:e.target.value})}/>
        <TextField label="Outstanding balance" type="number" value={form.outstanding_balance} onChange={e=>setForm({...form,outstanding_balance:e.target.value})}/>
        <TextField label="Interest rate %" type="number" value={form.interest_rate} onChange={e=>setForm({...form,interest_rate:e.target.value})}/>
        <TextField label="EMI" type="number" value={form.emi_amount} onChange={e=>setForm({...form,emi_amount:e.target.value})}/>
        <TextField label="Start date" type="date" InputLabelProps={{shrink:true}} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/>
        <TextField label="End date" type="date" InputLabelProps={{shrink:true}} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/>
        <TextField label="Next due date" type="date" InputLabelProps={{shrink:true}} value={form.next_due_date} onChange={e=>setForm({...form,next_due_date:e.target.value})}/>
        <TextField label="Notes" multiline minRows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
      </Box>

      <Button
        variant="contained"
        onClick={commit}
        disabled={busy==='commit'||!form.lender.trim()||!form.principal||!form.outstanding_balance}
        sx={{mt:1.5}}
      >
        {busy==='commit'?'Creating…':'Create reviewed debt'}
      </Button>
    </Paper>}
  </Stack>
}
