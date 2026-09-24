import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import type {Debt,DebtList} from '../types'
import {api} from '../api/client'
import {useFamily} from '../family'
import {useAppData} from '../appData'
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
  const {familyScope,familyUserId,scopeLabel,linkedUsers}=useFamily()
  const {auth,accounts}=useAppData()
  const navigate=useNavigate()
  const clay=claySx(resolvedMode)
  const canManage=familyScope==='self'&&!familyUserId
  const bankAccounts=accounts.filter((account:any)=>account.type==='bank')
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
  const [addOpen,setAddOpen]=useState(false)
  const [editId,setEditId]=useState<number|null>(null)
  const [editForm,setEditForm]=useState(emptyForm())
  const [payment,setPayment]=useState<Record<number,string>>({})
  const [paymentSource,setPaymentSource]=useState<Record<number,string>>({})
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function load(){
    setError('')
    try{setData(await api.debts(familyScope,familyUserId))}
    catch(e:any){
      setData({
        items:[],
        total_outstanding:0,
        loan_outstanding:0,
        credit_card_outstanding:0,
        monthly_emi:0,
        monthly_loan_emi:0,
        monthly_card_minimum_due:0,
        active_count:0,
      })
      setError(e.message||'Could not load liabilities.')
    }
  }

  useEffect(()=>{load()},[familyScope,familyUserId])

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
      const isCard=form.debt_type==='credit_card'
      setForm(emptyForm())
      setAddOpen(false)
      setNotice(isCard?'Credit card outstanding added.':'Loan added.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not add liability.')
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

  async function saveEdit(){
    if(!editId||!editForm.lender.trim()||!editForm.outstanding_balance)return
    setBusy('edit:'+editId);setError('');setNotice('')
    try{
      await api.updateDebt(editId,{
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
      setNotice('Liability updated.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not update liability.')
    }finally{
      setBusy('')
    }
  }

  async function deleteDebt(debt:Debt){
    if(!window.confirm(`Delete ${debt.lender} and its payment history?`))return
    setBusy('delete:'+debt.id);setError('');setNotice('')
    try{
      await api.deleteDebt(debt.id)
      setNotice('Liability deleted.')
      if(editId===debt.id)setEditId(null)
      await load()
    }catch(e:any){
      setError(e.message||'Could not delete liability.')
    }finally{
      setBusy('')
    }
  }

  async function addPayment(debt:Debt){
    const amount=Number(payment[debt.id]||0)
    if(!amount)return
    setBusy('payment:'+debt.id);setError('');setNotice('')
    try{
      const source=paymentSource[debt.id]||(bankAccounts[0]?String(bankAccounts[0].id):'cash')
      await api.addDebtPayment(debt.id,{
        amount,
        paid_at:new Date().toISOString(),
        note:'Recorded in Ledger liability tracker',
        ...(debt.debt_type==='credit_card'?{
          payment_method:source==='cash'?'cash':'upi',
          account_id:source==='cash'?null:Number(source),
        }:{})
      })
      setPayment(current=>({...current,[debt.id]:''}))
      setNotice('Payment recorded and outstanding balance updated.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not record payment.')
    }finally{
      setBusy('')
    }
  }

  async function closeDebt(debt:Debt){
    if(!window.confirm(`Mark ${debt.lender} as closed with ₹0 outstanding?`))return
    setBusy('close:'+debt.id);setError('');setNotice('')
    try{
      await api.updateDebt(debt.id,{status:'closed',outstanding_balance:0})
      setNotice('Liability marked closed.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not close liability.')
    }finally{
      setBusy('')
    }
  }

  const active=useMemo(()=>data.items.filter(d=>d.status==='active'),[data.items])
  const closed=useMemo(()=>data.items.filter(d=>d.status!=='active'),[data.items])
  const ownerName=(userId?:number)=>{
    if(userId===auth?.user_id)return 'You'
    return linkedUsers.find(user=>user.id===userId)?.name||'Family'
  }

  function liabilityFields(
    values:ReturnType<typeof emptyForm>,
    setValues:(value:ReturnType<typeof emptyForm>)=>void,
  ){
    const isCard=values.debt_type==='credit_card'
    return <Box sx={{
      display:'grid',
      gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},
      columnGap:1.5,
      rowGap:1.5,
      mt:.5,
    }}>
      <TextField
        label={isCard?'Card issuer / name':'Lender'}
        value={values.lender}
        onChange={e=>setValues({...values,lender:e.target.value})}
      />
      <TextField
        select
        label="Liability type"
        value={values.debt_type}
        onChange={e=>setValues({...values,debt_type:e.target.value})}
      >
        <MenuItem value="loan">Loan</MenuItem>
        <MenuItem value="credit_card">Credit card</MenuItem>
      </TextField>
      <TextField
        label={isCard?'Credit limit / original balance (optional)':'Principal (optional)'}
        type="number"
        value={values.principal}
        onChange={e=>setValues({...values,principal:e.target.value})}
      />
      <TextField
        label="Outstanding balance"
        type="number"
        value={values.outstanding_balance}
        onChange={e=>setValues({...values,outstanding_balance:e.target.value})}
      />
      <TextField
        label={isCard?'APR / interest rate %':'Interest rate %'}
        type="number"
        value={values.interest_rate}
        onChange={e=>setValues({...values,interest_rate:e.target.value})}
      />
      <TextField
        label={isCard?'Minimum due':'EMI'}
        type="number"
        value={values.emi_amount}
        onChange={e=>setValues({...values,emi_amount:e.target.value})}
      />
      <TextField
        label="Start date"
        type="date"
        InputLabelProps={{shrink:true}}
        value={values.start_date}
        onChange={e=>setValues({...values,start_date:e.target.value})}
      />
      <TextField
        label="End date"
        type="date"
        InputLabelProps={{shrink:true}}
        value={values.end_date}
        onChange={e=>setValues({...values,end_date:e.target.value})}
      />
      <TextField
        label="Next due date"
        type="date"
        InputLabelProps={{shrink:true}}
        value={values.next_due_date}
        onChange={e=>setValues({...values,next_due_date:e.target.value})}
      />
      <TextField
        label="Notes"
        multiline
        minRows={2}
        value={values.notes}
        onChange={e=>setValues({...values,notes:e.target.value})}
      />
    </Box>
  }

  function liabilityTable(rows:Debt[],activeRows:boolean){
    const widths={
      liability:220,
      owner:130,
      type:120,
      outstanding:145,
      rate:110,
      commitment:145,
      due:135,
      payment:350,
      actions:230,
    }
    const fixed=(width:number)=>({width,minWidth:width,maxWidth:width})
    const minWidth=
      widths.liability+
      (canManage?0:widths.owner)+
      widths.type+
      widths.outstanding+
      widths.rate+
      widths.commitment+
      widths.due+
      (activeRows&&canManage?widths.payment:0)+
      (canManage?widths.actions:0)

    return <TableContainer component={Paper} sx={{...clay,overflowX:'auto'}}>
      <Table size="small" sx={{minWidth,tableLayout:'fixed'}}>
        <TableHead>
          <TableRow>
            <TableCell sx={{fontWeight:800,...fixed(widths.liability)}}>Liability</TableCell>
            {!canManage&&<TableCell sx={{fontWeight:800,...fixed(widths.owner)}}>Owner</TableCell>}
            <TableCell sx={{fontWeight:800,...fixed(widths.type)}}>Type</TableCell>
            <TableCell sx={{fontWeight:800,...fixed(widths.outstanding)}} align="right">Outstanding</TableCell>
            <TableCell sx={{fontWeight:800,...fixed(widths.rate)}} align="right">Rate / APR</TableCell>
            <TableCell sx={{fontWeight:800,...fixed(widths.commitment)}} align="right">EMI / Min due</TableCell>
            <TableCell sx={{fontWeight:800,...fixed(widths.due)}}>Next due</TableCell>
            {activeRows&&canManage&&<TableCell sx={{fontWeight:800,...fixed(widths.payment)}}>Record payment</TableCell>}
            {canManage&&<TableCell sx={{fontWeight:800,...fixed(widths.actions)}}>Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(debt=>{
            const isCard=debt.debt_type==='credit_card'
            const recentPayment=debt.payments?.[0]
            return <TableRow key={debt.id} hover>
              <TableCell sx={fixed(widths.liability)}>
                <Typography variant="body2" fontWeight={800} noWrap title={debt.lender}>{debt.lender}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {debt.source_type.replace('_',' ')}
                  {recentPayment?` · last payment ${money(recentPayment.amount)}`:''}
                </Typography>
              </TableCell>
              {!canManage&&<TableCell sx={fixed(widths.owner)}>
                <Typography variant="body2" fontWeight={700} noWrap>{ownerName(debt.user_id)}</Typography>
              </TableCell>}
              <TableCell sx={fixed(widths.type)}>
                <Chip size="small" variant="outlined" label={isCard?'Credit card':'Loan'}/>
              </TableCell>
              <TableCell sx={fixed(widths.outstanding)} align="right">
                <Typography variant="body2" fontWeight={800}>{money(debt.outstanding_balance)}</Typography>
              </TableCell>
              <TableCell sx={fixed(widths.rate)} align="right">{debt.interest_rate!=null?`${debt.interest_rate}%`:'—'}</TableCell>
              <TableCell sx={fixed(widths.commitment)} align="right">{debt.emi_amount!=null?money(debt.emi_amount):'—'}</TableCell>
              <TableCell sx={fixed(widths.due)}>{debt.next_due_date?new Date(debt.next_due_date).toLocaleDateString('en-IN'):'—'}</TableCell>
              {activeRows&&canManage&&<TableCell sx={fixed(widths.payment)}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <TextField
                    size="small"
                    type="number"
                    placeholder="Amount"
                    value={payment[debt.id]||''}
                    onChange={e=>setPayment(current=>({...current,[debt.id]:e.target.value}))}
                    inputProps={{min:0,step:.01,inputMode:'decimal'}}
                    sx={{width:105}}
                  />
                  {isCard&&<TextField
                    select
                    size="small"
                    label="Pay from"
                    value={paymentSource[debt.id]||(bankAccounts[0]?String(bankAccounts[0].id):'cash')}
                    onChange={e=>setPaymentSource(current=>({...current,[debt.id]:String(e.target.value)}))}
                    sx={{width:145}}
                  >
                    {bankAccounts.map((account:any)=><MenuItem key={account.id} value={String(account.id)}>{account.name}</MenuItem>)}
                    <MenuItem value="cash">Cash in hand</MenuItem>
                  </TextField>}
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PaidRoundedIcon/>}
                    disabled={busy==='payment:'+debt.id||!Number(payment[debt.id]||0)}
                    onClick={()=>addPayment(debt)}
                  >
                    Pay
                  </Button>
                </Stack>
              </TableCell>}
              {canManage&&<TableCell sx={fixed(widths.actions)}>
                <Stack direction="row" spacing={0.5} sx={{whiteSpace:'nowrap'}}>
                  <Button size="small" startIcon={<EditRoundedIcon/>} onClick={()=>startEdit(debt)}>Edit</Button>
                  {activeRows&&<Button size="small" disabled={busy==='close:'+debt.id} onClick={()=>closeDebt(debt)}>Close</Button>}
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineRoundedIcon/>}
                    disabled={busy==='delete:'+debt.id}
                    onClick={()=>deleteDebt(debt)}
                  >
                    Delete
                  </Button>
                </Stack>
              </TableCell>}
            </TableRow>
          })}
          {!rows.length&&<TableRow>
            <TableCell colSpan={canManage?(activeRows?8:7):7}>
              <Typography variant="body2" color="text.secondary" sx={{py:2,textAlign:'center'}}>
                {activeRows?'No active liabilities yet.':'No closed or paused liabilities.'}
              </Typography>
            </TableCell>
          </TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  }

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'flex-start',sm:'flex-end'}} spacing={1}>
      <Box>
        <Typography variant="overline" color="text.secondary">LIABILITIES</Typography>
        <Typography variant="h1">Liability tracker</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
          Track loans and credit-card outstanding in one place. Loan-document imports are under Import → Debt.
        </Typography>
      </Box>
      {canManage&&<Button
        variant="contained"
        startIcon={<AddRoundedIcon/>}
        onClick={()=>{setForm(emptyForm());setAddOpen(true);setError('');setNotice('')}}
      >
        Add liability
      </Button>}
    </Stack>

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

    {!canManage&&<Alert severity="info">
      Viewing {scopeLabel} liabilities in read-only mode. Only liabilities explicitly shared with you are returned.
    </Alert>}
    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    <Typography variant="h2">Active liabilities</Typography>
    {liabilityTable(active,true)}

    {closed.length>0&&<>
      <Typography variant="h2" sx={{mt:1}}>Closed / paused</Typography>
      {liabilityTable(closed,false)}
    </>}

    <Paper sx={{...clay,p:{xs:1.4,sm:1.8}}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" alignItems={{md:'center'}} spacing={1.25}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeRoundedIcon color="primary"/>
            <Typography variant="h2">Finance guidance</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{mt:.5,maxWidth:760}}>
            Ledger AI can use your calculated income, spending, loan EMIs, credit-card outstanding and minimum dues to explain repayment pressure and suggest a practical finance plan.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={()=>{
            sessionStorage.setItem('ledger_ai_prompt','How can I improve my finances and reduce my loans and credit-card outstanding based on my income, spending, EMIs and minimum dues?')
            navigate('/ai')
          }}
        >
          Ask AI for a debt plan
        </Button>
      </Stack>
    </Paper>

    <Dialog
      open={addOpen}
      onClose={busy==='create'?undefined:()=>setAddOpen(false)}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Add loan or credit card</DialogTitle>
      <DialogContent>
        {liabilityFields(form,setForm)}
      </DialogContent>
      <DialogActions sx={{p:2}}>
        <Button onClick={()=>setAddOpen(false)} disabled={busy==='create'}>Cancel</Button>
        <Button
          variant="contained"
          onClick={createDebt}
          disabled={busy==='create'||!form.lender.trim()||!form.outstanding_balance}
        >
          {busy==='create'?'Saving…':form.debt_type==='credit_card'?'Add credit card':'Add loan'}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog
      open={editId!==null}
      onClose={busy.startsWith('edit:')?undefined:()=>setEditId(null)}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Edit liability</DialogTitle>
      <DialogContent>
        {liabilityFields(editForm,setEditForm)}
      </DialogContent>
      <DialogActions sx={{p:2}}>
        <Button onClick={()=>setEditId(null)} disabled={busy.startsWith('edit:')}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<SaveRoundedIcon/>}
          onClick={saveEdit}
          disabled={!editForm.lender.trim()||!editForm.outstanding_balance||busy.startsWith('edit:')}
        >
          {busy.startsWith('edit:')?'Saving…':'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  </Stack>
}
