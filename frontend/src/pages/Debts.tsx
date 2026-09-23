import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import type {Debt,DebtList} from '../types'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const toDateInput=(value?:string|null)=>value?new Date(value).toISOString().slice(0,10):''
const isoDate=(value:string)=>value?new Date(value+'T00:00:00').toISOString():null

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
})

export default function Debts(){
  const {resolvedMode}=useUI()
  const navigate=useNavigate()
  const clay=claySx(resolvedMode)
  const [data,setData]=useState<DebtList>({
    items:[],
    total_outstanding:0,
    loan_outstanding:0,
    credit_card_outstanding:0,
    monthly_emi:0,
    monthly_loan_emi:0,
    monthly_card_minimum_due:0,
    active_count:0,
  })
  const [form,setForm]=useState(emptyForm())
  const [editId,setEditId]=useState<number|null>(null)
  const [editForm,setEditForm]=useState(emptyForm())
  const [payment,setPayment]=useState<Record<number,string>>({})
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function load(){
    try{setData(await api.debts())}
    catch(e:any){setError(e.message||'Could not load debts.')}
  }

  useEffect(()=>{load()},[])

  async function createDebt(){
    if(!form.lender.trim()||!form.outstanding_balance)return
    setBusy('create');setError('');setNotice('')
    try{
      await api.createDebt({
        lender:form.lender.trim(),
        debt_type:form.debt_type||'loan',
        principal:Number(form.principal||form.outstanding_balance),
        outstanding_balance:Number(form.outstanding_balance),
        interest_rate:form.interest_rate?Number(form.interest_rate):null,
        emi_amount:form.emi_amount?Number(form.emi_amount):null,
        start_date:isoDate(form.start_date),
        end_date:isoDate(form.end_date),
        next_due_date:isoDate(form.next_due_date),
        status:'active',
        notes:form.notes||null,
        source_type:'manual',
      })
      setForm(emptyForm())
      setNotice(form.debt_type==='credit_card'?'Credit card outstanding added.':'Debt added.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not add debt.')
    }finally{
      setBusy('')
    }
  }

  function startEdit(debt:Debt){
    setEditId(debt.id)
    setEditForm({
      lender:debt.lender||'',
      debt_type:debt.debt_type||'loan',
      principal:String(debt.principal??''),
      outstanding_balance:String(debt.outstanding_balance??''),
      interest_rate:debt.interest_rate!=null?String(debt.interest_rate):'',
      emi_amount:debt.emi_amount!=null?String(debt.emi_amount):'',
      start_date:toDateInput(debt.start_date),
      end_date:toDateInput(debt.end_date),
      next_due_date:toDateInput(debt.next_due_date),
      notes:debt.notes||'',
    })
    setError('')
    setNotice('')
  }

  async function saveEdit(debt:Debt){
    if(!editForm.lender.trim()||!editForm.outstanding_balance)return
    setBusy('edit:'+debt.id);setError('');setNotice('')
    try{
      await api.updateDebt(debt.id,{
        lender:editForm.lender.trim(),
        debt_type:editForm.debt_type||'loan',
        principal:Number(editForm.principal||editForm.outstanding_balance),
        outstanding_balance:Number(editForm.outstanding_balance||0),
        interest_rate:editForm.interest_rate?Number(editForm.interest_rate):null,
        emi_amount:editForm.emi_amount?Number(editForm.emi_amount):null,
        start_date:isoDate(editForm.start_date),
        end_date:isoDate(editForm.end_date),
        next_due_date:isoDate(editForm.next_due_date),
        notes:editForm.notes||null,
      })
      setEditId(null)
      setNotice('Debt updated.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not update debt.')
    }finally{
      setBusy('')
    }
  }

  async function deleteDebt(debt:Debt){
    if(!window.confirm(`Delete ${debt.lender} debt and its payment history?`))return
    setBusy('delete:'+debt.id);setError('');setNotice('')
    try{
      await api.deleteDebt(debt.id)
      setNotice('Debt deleted.')
      if(editId===debt.id)setEditId(null)
      await load()
    }catch(e:any){
      setError(e.message||'Could not delete debt.')
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
    const editing=editId===debt.id
    const isCard=debt.debt_type==='credit_card'
    return <Paper key={debt.id} sx={{...clay,p:{xs:1.35,sm:1.8}}}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{minWidth:0}}>
          <Typography variant="body1" sx={{fontWeight:800,overflowWrap:'anywhere'}}>{debt.lender}</Typography>
          <Typography variant="caption" color="text.secondary">
            {isCard?'Credit card':'Loan'} · {debt.status} · {debt.source_type.replace('_',' ')}
          </Typography>
        </Box>
        <Chip size="small" color={debt.status==='active'?'primary':'default'} label={money(debt.outstanding_balance)}/>
      </Stack>

      {editing?<Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},
        columnGap:1.5,
        rowGap:1.5,
        mt:1.5,
      }}>
        <TextField label={isCard?'Card issuer / name':'Lender'} value={editForm.lender} onChange={e=>setEditForm({...editForm,lender:e.target.value})}/>
        <TextField select label="Liability type" value={editForm.debt_type} onChange={e=>setEditForm({...editForm,debt_type:e.target.value})}>
          <MenuItem value="loan">Loan</MenuItem>
          <MenuItem value="credit_card">Credit card</MenuItem>
        </TextField>
        <TextField label={isCard?'Credit limit / original balance':'Principal'} type="number" value={editForm.principal} onChange={e=>setEditForm({...editForm,principal:e.target.value})}/>
        <TextField label="Outstanding balance" type="number" value={editForm.outstanding_balance} onChange={e=>setEditForm({...editForm,outstanding_balance:e.target.value})}/>
        <TextField label={isCard?'APR / interest rate %':'Interest rate %'} type="number" value={editForm.interest_rate} onChange={e=>setEditForm({...editForm,interest_rate:e.target.value})}/>
        <TextField label={isCard?'Minimum due':'EMI'} type="number" value={editForm.emi_amount} onChange={e=>setEditForm({...editForm,emi_amount:e.target.value})}/>
        <TextField label="Start date" type="date" InputLabelProps={{shrink:true}} value={editForm.start_date} onChange={e=>setEditForm({...editForm,start_date:e.target.value})}/>
        <TextField label="End date" type="date" InputLabelProps={{shrink:true}} value={editForm.end_date} onChange={e=>setEditForm({...editForm,end_date:e.target.value})}/>
        <TextField label="Next due date" type="date" InputLabelProps={{shrink:true}} value={editForm.next_due_date} onChange={e=>setEditForm({...editForm,next_due_date:e.target.value})}/>
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/>
        <Stack direction="row" spacing={1} sx={{gridColumn:{sm:'1 / -1'}}}>
          <Button variant="contained" startIcon={<SaveRoundedIcon/>} onClick={()=>saveEdit(debt)} disabled={busy==='edit:'+debt.id}>Save</Button>
          <Button onClick={()=>setEditId(null)}>Cancel</Button>
        </Stack>
      </Box>:<>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',sm:'repeat(4,1fr)'},gap:1.25,mt:1.4}}>
          <Box><Typography variant="caption" color="text.secondary">{isCard?'Limit / original':'Principal'}</Typography><Typography variant="body2" sx={{fontWeight:700}}>{money(debt.principal)}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">{isCard?'APR':'Rate'}</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.interest_rate!=null?`${debt.interest_rate}%`:'—'}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">{isCard?'Minimum due':'EMI'}</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.emi_amount!=null?money(debt.emi_amount):'—'}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Next due</Typography><Typography variant="body2" sx={{fontWeight:700}}>{debt.next_due_date?new Date(debt.next_due_date).toLocaleDateString('en-IN'):'—'}</Typography></Box>
        </Box>
        {debt.notes&&<Typography variant="body2" color="text.secondary" sx={{mt:1.1,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{debt.notes}</Typography>}
      </>}

      {!editing&&<>
        <Divider sx={{my:1.25}}/>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          {debt.status==='active'&&<>
            <TextField
              label="Record payment"
              type="number"
              value={payment[debt.id]||''}
              onChange={e=>setPayment({...payment,[debt.id]:e.target.value})}
              inputProps={{min:0,step:.01,inputMode:'decimal'}}
              sx={{flex:1}}
            />
            <Button variant="contained" startIcon={<PaidRoundedIcon/>} disabled={busy==='payment:'+debt.id||!Number(payment[debt.id]||0)} onClick={()=>addPayment(debt)}>
              Add payment
            </Button>
            <Button disabled={busy==='close:'+debt.id} onClick={()=>closeDebt(debt)}>Close</Button>
          </>}
          <Button startIcon={<EditRoundedIcon/>} onClick={()=>startEdit(debt)}>Edit</Button>
          <Button color="error" startIcon={<DeleteOutlineRoundedIcon/>} disabled={busy==='delete:'+debt.id} onClick={()=>deleteDebt(debt)}>Delete</Button>
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
      <Typography variant="h1">Liability tracker</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        Track loans and credit-card outstanding in one place. Loan-document imports are under Import → Debt.
      </Typography>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',lg:'repeat(4,1fr)'},gap:1}}>
      {[
        ['Total outstanding',money(data.total_outstanding)],
        ['Loan outstanding',money(data.loan_outstanding)],
        ['Card outstanding',money(data.credit_card_outstanding)],
        ['Monthly commitments',money(data.monthly_emi)],
      ].map(([label,value])=><Paper key={label} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography sx={{fontWeight:850,fontSize:'1.3rem',mt:.25}}>{value}</Typography>
      </Paper>)}
    </Box>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 340px'},gap:{xs:1.4,sm:2}}}>
      <Stack spacing={1.4}>
        <Paper sx={{...clay,p:{xs:1.4,sm:1.9}}}>
          <Typography variant="h2">Add loan or credit card</Typography>
          <Box sx={{
            display:'grid',
            gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},
            columnGap:1.5,
            rowGap:1.5,
            mt:1.5,
          }}>
            <TextField label={form.debt_type==='credit_card'?'Card issuer / name':'Lender'} value={form.lender} onChange={e=>setForm({...form,lender:e.target.value})}/>
            <TextField select label="Liability type" value={form.debt_type} onChange={e=>setForm({...form,debt_type:e.target.value})}>
              <MenuItem value="loan">Loan</MenuItem>
              <MenuItem value="credit_card">Credit card</MenuItem>
            </TextField>
            <TextField label={form.debt_type==='credit_card'?'Credit limit / original balance (optional)':'Principal (optional)'} type="number" value={form.principal} onChange={e=>setForm({...form,principal:e.target.value})}/>
            <TextField label="Outstanding balance" type="number" value={form.outstanding_balance} onChange={e=>setForm({...form,outstanding_balance:e.target.value})}/>
            <TextField label={form.debt_type==='credit_card'?'APR / interest rate %':'Interest rate %'} type="number" value={form.interest_rate} onChange={e=>setForm({...form,interest_rate:e.target.value})}/>
            <TextField label={form.debt_type==='credit_card'?'Minimum due':'EMI'} type="number" value={form.emi_amount} onChange={e=>setForm({...form,emi_amount:e.target.value})}/>
            <TextField label="Start date" type="date" InputLabelProps={{shrink:true}} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/>
            <TextField label="End date" type="date" InputLabelProps={{shrink:true}} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/>
            <TextField label="Next due date" type="date" InputLabelProps={{shrink:true}} value={form.next_due_date} onChange={e=>setForm({...form,next_due_date:e.target.value})}/>
            <TextField label="Notes" multiline minRows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
          </Box>
          <Button variant="contained" sx={{mt:1.5}} disabled={busy==='create'||!form.lender.trim()||!form.outstanding_balance} onClick={createDebt}>
            {busy==='create'?'Saving…':form.debt_type==='credit_card'?'Add credit card':'Add loan'}
          </Button>
        </Paper>

        <Typography variant="h2">Active liabilities</Typography>
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
          Ledger AI can use your calculated income, spending, loan EMIs, credit-card outstanding and minimum dues to explain repayment pressure and suggest a practical finance plan.
        </Typography>
        <Button
          fullWidth
          variant="outlined"
          sx={{mt:1.3}}
          onClick={()=>{
            sessionStorage.setItem('ledger_ai_prompt','How can I improve my finances and reduce my loans and credit-card outstanding based on my income, spending, EMIs and minimum dues?')
            navigate('/ai')
          }}
        >
          Ask AI for a debt plan
        </Button>
      </Paper>
    </Box>
  </Stack>
}
