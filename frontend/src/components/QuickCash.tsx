import {useEffect,useState} from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {api} from '../api/client'
import {useAppData} from '../appData'

const defaults=['Food & Dining','Fuel','Groceries','EMI & Loans','Shopping','Bills & Subscriptions','Travel','Health','Payroll','Investments','Other']

const initialForm=()=>({
  amount:'',
  direction:'debit' as 'credit'|'debit',
  payment_method:'cash' as 'cash'|'upi',
  account_id:'',
  category:'Food & Dining',
  txn_at:new Date().toISOString().slice(0,16),
  merchant:'',
  note:'',
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
  const {accounts,categories}=useAppData()
  const cats=categories.length?categories:defaults.map(name=>({name}))
  const bankAccounts=accounts.filter((account:any)=>account.type==='bank')
  const [form,setForm]=useState(initialForm)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(open)setError('')
  },[open])

  function setDirection(direction:'credit'|'debit'){
    setForm(current=>({
      ...current,
      direction,
      category:direction==='credit'
        ? (current.category==='Food & Dining'?'Payroll':current.category)
        : (current.category==='Payroll'?'Food & Dining':current.category),
    }))
  }

  function setPaymentMethod(payment_method:'cash'|'upi'){
    setForm(current=>({
      ...current,
      payment_method,
      account_id:payment_method==='cash'
        ? ''
        : current.account_id||String(bankAccounts[0]?.id||''),
    }))
  }

  async function save(){
    if(
      saving||
      !form.amount||
      !form.category||
      (form.payment_method==='upi'&&!form.account_id)
    )return

    setSaving(true)
    setError('')
    try{
      await api.manualTransaction({
        amount:Number(form.amount),
        direction:form.direction,
        payment_method:form.payment_method,
        account_id:form.payment_method==='upi'?Number(form.account_id):null,
        category:form.category,
        txn_at:new Date(form.txn_at).toISOString(),
        merchant:form.merchant.trim()||null,
        note:form.note.trim()||null,
      })
      await onSaved()
      setForm(initialForm())
      onClose()
    }catch(e:any){
      setError(e.message||'Could not save this transaction.')
    }finally{
      setSaving(false)
    }
  }

  const isIncome=form.direction==='credit'
  const upiUnavailable=form.payment_method==='upi'&&!bankAccounts.length

  return <Dialog
    open={open}
    onClose={saving?undefined:onClose}
    fullWidth
    maxWidth="xs"
    PaperProps={{sx:{borderRadius:4}}}
  >
    <DialogTitle>Add transaction</DialogTitle>
    <DialogContent>
      <Stack spacing={1.6} sx={{pt:.5}}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={form.direction}
          disabled={saving}
          onChange={(_,value:'credit'|'debit'|null)=>{if(value)setDirection(value)}}
        >
          <ToggleButton value="credit">Money in · Income</ToggleButton>
          <ToggleButton value="debit">Money out · Expense</ToggleButton>
        </ToggleButtonGroup>

        <Stack spacing={.6}>
          <Typography variant="caption" color="text.secondary">PAYMENT METHOD</Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={form.payment_method}
            disabled={saving}
            onChange={(_,value:'cash'|'upi'|null)=>{if(value)setPaymentMethod(value)}}
          >
            <ToggleButton value="cash">Cash</ToggleButton>
            <ToggleButton value="upi">UPI</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {form.payment_method==='upi'&&<FormControl size="small" disabled={saving||!bankAccounts.length}>
          <InputLabel>Bank account</InputLabel>
          <Select
            label="Bank account"
            value={form.account_id}
            onChange={e=>setForm({...form,account_id:String(e.target.value)})}
          >
            {bankAccounts.map((account:any)=><MenuItem key={account.id} value={String(account.id)}>
              {account.name}
            </MenuItem>)}
          </Select>
        </FormControl>}

        {upiUnavailable&&<Alert severity="warning">
          Add a bank account first before recording a manual UPI transaction.
        </Alert>}

        <TextField
          label="Amount"
          type="number"
          inputProps={{inputMode:'decimal',min:0,step:.01}}
          value={form.amount}
          disabled={saving}
          onChange={e=>setForm({...form,amount:e.target.value})}
        />

        <FormControl size="small">
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={form.category}
            disabled={saving}
            onChange={e=>setForm({...form,category:String(e.target.value)})}
          >
            {cats.map((category:any)=><MenuItem key={category.name} value={category.name}>{category.name}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          label="Merchant / paid to"
          value={form.merchant}
          disabled={saving}
          onChange={e=>setForm({...form,merchant:e.target.value})}
        />

        <TextField
          label="Date & time"
          type="datetime-local"
          value={form.txn_at}
          disabled={saving}
          InputLabelProps={{shrink:true}}
          onChange={e=>setForm({...form,txn_at:e.target.value})}
        />

        <TextField
          label="Description / note"
          value={form.note}
          disabled={saving}
          onChange={e=>setForm({...form,note:e.target.value})}
        />

        {error&&<Alert severity="error">{error}</Alert>}
        {saving&&<Alert severity="info">Saving once — duplicate taps are blocked.</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{p:2}}>
      <Button onClick={onClose} disabled={saving}>Cancel</Button>
      <Button
        variant="contained"
        onClick={save}
        disabled={
          !form.amount||
          !form.category||
          saving||
          (form.payment_method==='upi'&&!form.account_id)
        }
      >
        {saving?'Saving…':isIncome?'Save income':'Save expense'}
      </Button>
    </DialogActions>
  </Dialog>
}
