import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import type {Debt,DebtList} from '../types'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const emptyForm=()=>({
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
  source_type:'manual',
  source_file_name:'',
})

function isoDate(value:string){
  if(!value)return null
  return new Date(value+'T00:00:00').toISOString()
}

export default function Debts(){
  const {resolvedMode}=useUI()
  const navigate=useNavigate()
  const [data,setData]=useState<DebtList>({items:[],total_outstanding:0,monthly_emi:0,active_count:0})
  const [form,setForm]=useState(emptyForm())
  const [aiPreview,setAiPreview]=useState<any>(null)
  const [payment,setPayment]=useState<Record<number,string>>({})
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const clay=claySx(resolvedMode)

  async function load(){
    try{setData(await api.debts())}
    catch(e:any){setError(e.message||'Could not load debts.')}
  }

  useEffect(()=>{load()},[])

  async function createDebt(){
    if(!form.lender.trim()||!form.principal||!form.outstanding_balance)return
    setBusy('create');setError('');setNotice('')
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
        source_type:form.source_type||'manual',
        source_file_name:form.source_file_name||null,
      })
      setNotice('Debt added.')
      setForm(emptyForm())
      setAiPreview(null)
      await load()
    }catch(e:any){
      setError(e.message||'Could not add debt.')
    }finally{
      setBusy('')
    }
  }

  async function analyze(file:File){
    setBusy('ai');setError('');setNotice('');setAiPreview(null)
    try{
      const result=await api.debtAIPreview(file)
      const p=result.preview||{}
      setAiPreview(result)
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
      setNotice('AI extracted loan terms. Review every field before creating the debt.')
    }catch(e:any){
      setError(e.message||'Could not analyze this loan document.')
    }finally{
      setBusy('')
    }
  }

  async function addPayment(debt:Debt){
    const amount=Number(payment[debt.id]||0)
    if(!amount)return
    setBusy('payment:'+debt.id);setError('');setNotice('')
    try{
      await api.addDebtPayment(debt.id,{
        amount,
        paid_at:new Date().toISOString(),
        note:'Recorded in Ledger debt tracker',
      })
      setPayment({...payment,[debt.id]:''})
      setNotice('Debt payment recorded and outstanding balance updated.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not record payment.')
    }finally{
      setBusy('')
    }
  }

  async function closeDebt(debt:Debt){
    setBusy('close:'+debt.id);setError('');setNotice('')
    try{
      await api.updateDebt(debt.id,{status:'closed',outstanding_balance:0})
      setNotice('Debt marked closed.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not close debt.')
    }finally{
      setBusy('')
    }
  }

  const active=useMemo(()=>data.items.filter(d=>d.status==='active'),[data.items])
  const closed=useMemo(()=>data.items.filter(d=>d.status!=='active'),[data.items])

  function debtCard(debt:Debt){
    return <Paper key={debt.id} sx={{...clay,p:{xs:1.35,sm:1.8}}}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{minWidth:0}}>
          <Typography variant="body1" sx={{fontWeight:800,overflowWrap:'anywhere'}}>{debt.lender}</Typography>
          <Typography variant="caption" color="text.secondary">{debt.debt_type} · {debt.status}</Typography>
        </Box>
        <Chip size="small" color={debt.status==='active'?'primary':'default'} label={money(debt.outstanding_balance)}/>
      </Stack>

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',sm:'repeat(4,1fr)'},gap:1,mt:1.4}}>
        <Box><Typography variant="caption" color="text.secondary">Principal</Typography><Typography variant="body2" sx={{fontWeight:700}}>{money(debt.principal)}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Rate</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.interest_rate!=null?`${debt.interest_rate}%`:'—'}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">EMI</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.emi_amount!=null?money(debt.emi_amount):'—'}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Next due</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.next_due_date?new Date(debt.next_due_date).toLocaleDateString('en-IN'):'—'}</Typography></Box>
      </Box>

      {debt.notes&&<Typography variant="body2" color="text.secondary" sx={{mt:1.2,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{debt.notes}</Typography>}

      {debt.status==='active'&&<>
        <Divider sx={{my:1.35}}/>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          <TextField
            label="Record payment"
            type="number"
            value={payment[debt.id]||''}
            onChange={e=>setPayment({...payment,[debt.id]:e.target.value})}
            inputProps={{min:0,step:.01,inputMode:'decimal'}}
            sx={{flex:1}}
          />
          <Button
            variant="contained"
            startIcon={<PaidRoundedIcon/>}
            disabled={busy==='payment:'+debt.id||!Number(payment[debt.id]||0)}
            onClick={()=>addPayment(debt)}
          >
            Add payment
          </Button>
          <Button color="error" disabled={busy==='close:'+debt.id} onClick={()=>closeDebt(debt)}>Close</Button>
        </Stack>
      </>}

      {debt.payments?.length>0&&<Box sx={{mt:1.25}}>
        <Typography variant="caption" color="text.secondary">RECENT PAYMENTS</Typography>
        <Stack spacing={0.6} sx={{mt:.5}}>
          {debt.payments.slice(0,3).map(p=><Stack key={p.id} direction="row" justifyContent="space-between">
            <Typography variant="caption">{new Date(p.paid_at).toLocaleDateString('en-IN')}</Typography>
            <Typography variant="caption" sx={{fontWeight:700}}>{money(p.amount)}</Typography>
          </Stack>)}
        </Stack>
      </Box>}
    </Paper>
  }

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">LIABILITIES</Typography>
      <Typography variant="h1">Debt tracker</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        Track what you owe, EMIs, due dates and repayments separately from everyday spending.
      </Typography>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},gap:1}}>
      {[
        ['Outstanding',money(data.total_outstanding)],
        ['Monthly EMI',money(data.monthly_emi)],
        ['Active debts',String(data.active_count)],
      ].map(([label,value])=><Paper key={label} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography sx={{fontWeight:850,fontSize:'1.3rem',mt:.25}}>{value}</Typography>
      </Paper>)}
    </Box>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 360px'},gap:{xs:1.2,sm:2}}}>
      <Stack spacing={1.25}>
        <Paper sx={{...clay,p:{xs:1.4,sm:1.9}}}>
          <Typography variant="h2">Add debt</Typography>
          <Typography variant="body2" color="text.secondary" sx={{mt:.35,mb:1.3}}>
            Add manually or upload a searchable loan PDF/TXT and let AI prepare a reviewable draft.
          </Typography>

          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadRoundedIcon/>}
            disabled={busy==='ai'}
            sx={{mb:1.4}}
          >
            {busy==='ai'?'Analyzing…':'Analyze loan document'}
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

          {aiPreview&&<Alert severity="info" sx={{mb:1.25}}>
            Confidence: {Math.round((aiPreview.preview?.confidence||0)*100)}%. {aiPreview.privacy}
          </Alert>}

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1}}>
            <TextField label="Lender" value={form.lender} onChange={e=>setForm({...form,lender:e.target.value})}/>
            <TextField label="Debt type" value={form.debt_type} onChange={e=>setForm({...form,debt_type:e.target.value})}/>
            <TextField label="Principal" type="number" value={form.principal} onChange={e=>setForm({...form,principal:e.target.value})}/>
            <TextField label="Outstanding balance" type="number" value={form.outstanding_balance} onChange={e=>setForm({...form,outstanding_balance:e.target.value})}/>
            <TextField label="Interest rate %" type="number" value={form.interest_rate} onChange={e=>setForm({...form,interest_rate:e.target.value})}/>
            <TextField label="EMI" type="number" value={form.emi_amount} onChange={e=>setForm({...form,emi_amount:e.target.value})}/>
            <TextField label="Start date" type="date" InputLabelProps={{shrink:true}} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/>
            <TextField label="End date" type="date" InputLabelProps={{shrink:true}} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/>
            <TextField label="Next due date" type="date" InputLabelProps={{shrink:true}} value={form.next_due_date} onChange={e=>setForm({...form,next_due_date:e.target.value})}/>
            <TextField label="Notes" value={form.notes} multiline minRows={2} onChange={e=>setForm({...form,notes:e.target.value})}/>
          </Box>

          <Button
            variant="contained"
            sx={{mt:1.25}}
            disabled={busy==='create'||!form.lender.trim()||!form.principal||!form.outstanding_balance}
            onClick={createDebt}
          >
            {busy==='create'?'Saving…':aiPreview?'Create reviewed debt':'Add debt'}
          </Button>
        </Paper>

        <Typography variant="h2">Active debts</Typography>
        {active.map(debtCard)}
        {!active.length&&<Paper sx={{...clay,p:1.5}}><Typography variant="body2" color="text.secondary">No active debts yet.</Typography></Paper>}

        {closed.length>0&&<>
          <Typography variant="h2" sx={{mt:1}}>Closed / paused</Typography>
          {closed.map(debtCard)}
        </>}
      </Stack>

      <Paper sx={{...clay,p:{xs:1.4,sm:1.8},height:'fit-content'}}>
        <AutoAwesomeRoundedIcon color="primary"/>
        <Typography variant="h2" sx={{mt:.7}}>Finance guidance</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.5}}>
          Ledger AI can use your calculated income, spending, categories and debt totals to explain repayment pressure and suggest a practical finance plan. It is restricted to personal-finance questions.
        </Typography>
        <Button
          fullWidth
          variant="outlined"
          sx={{mt:1.3}}
          onClick={()=>{
            sessionStorage.setItem('ledger_ai_prompt','How can I improve my finances and pay down my debt based on my income, spending and EMI commitments?')
            navigate('/ai')
          }}
        >
          Ask AI for a debt plan
        </Button>
        <Alert severity="info" sx={{mt:1.3}}>
          Loan documents are not stored. Account numbers, IFSC codes, UPI IDs and long identifiers are redacted before AI processing.
        </Alert>
      </Paper>
    </Box>
  </Stack>
}
