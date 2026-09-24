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
type EntryType='income'|'expense'|'transfer'

const initialForm=()=>({
  entry_type:'expense' as EntryType,
  amount:'',
  direction:'debit' as 'credit'|'debit',
  payment_method:'cash' as 'cash'|'upi'|'credit_card',
  account_id:'',
  to_account_id:'',
  credit_card_id:'',
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
  const [cards,setCards]=useState<any[]>([])
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(!open)return
    setError('')
    api.debts('self')
      .then(result=>{
        const activeCards=(result?.items||[]).filter((debt:any)=>debt.debt_type==='credit_card'&&debt.status==='active')
        setCards(activeCards)
        setForm(current=>({
          ...current,
          credit_card_id:current.credit_card_id||String(activeCards[0]?.id||''),
          account_id:current.account_id||String(bankAccounts[0]?.id||''),
          to_account_id:current.to_account_id||String(bankAccounts.find((account:any)=>String(account.id)!==String(current.account_id||bankAccounts[0]?.id||''))?.id||''),
        }))
      })
      .catch(()=>setCards([]))
  },[open])

  function setEntryType(entry_type:EntryType){
    setForm(current=>{
      if(entry_type==='transfer'){
        const from=String(current.account_id||bankAccounts[0]?.id||'')
        const to=String(
          current.to_account_id&&current.to_account_id!==from
            ? current.to_account_id
            : bankAccounts.find((account:any)=>String(account.id)!==from)?.id||''
        )
        return {
          ...current,
          entry_type,
          direction:'debit',
          payment_method:'upi',
          account_id:from,
          to_account_id:to,
          category:'Internal Transfer',
          credit_card_id:'',
          merchant:'',
        }
      }
      const direction=entry_type==='income'?'credit':'debit'
      return {
        ...current,
        entry_type,
        direction,
        to_account_id:'',
        payment_method:direction==='credit'&&current.payment_method==='credit_card'?'cash':current.payment_method,
        category:entry_type==='income'
          ? (current.category==='Food & Dining'||current.category==='Internal Transfer'?'Payroll':current.category)
          : (current.category==='Payroll'||current.category==='Internal Transfer'?'Food & Dining':current.category),
      }
    })
  }

  function setPaymentMethod(payment_method:'cash'|'upi'|'credit_card'){
    setForm(current=>({
      ...current,
      payment_method,
      account_id:payment_method==='upi'
        ? current.account_id||String(bankAccounts[0]?.id||'')
        : '',
      credit_card_id:payment_method==='credit_card'
        ? current.credit_card_id||String(cards[0]?.id||'')
        : '',
    }))
  }

  async function save(){
    const isTransfer=form.entry_type==='transfer'
    if(
      saving||
      !form.amount||
      (!isTransfer&&!form.category)||
      (!isTransfer&&form.payment_method==='upi'&&!form.account_id)||
      (!isTransfer&&form.payment_method==='credit_card'&&!form.credit_card_id)||
      (isTransfer&&(!form.account_id||!form.to_account_id||form.account_id===form.to_account_id))
    )return

    setSaving(true)
    setError('')
    try{
      if(isTransfer){
        await api.internalTransfer({
          amount:Number(form.amount),
          from_account_id:Number(form.account_id),
          to_account_id:Number(form.to_account_id),
          txn_at:new Date(form.txn_at).toISOString(),
          note:form.note.trim()||null,
        })
      }else{
        await api.manualTransaction({
          amount:Number(form.amount),
          direction:form.direction,
          payment_method:form.payment_method,
          account_id:form.payment_method==='upi'?Number(form.account_id):null,
          credit_card_id:form.payment_method==='credit_card'?Number(form.credit_card_id):null,
          category:form.category,
          txn_at:new Date(form.txn_at).toISOString(),
          merchant:form.merchant.trim()||null,
          note:form.note.trim()||null,
        })
      }
      await onSaved()
      setForm(initialForm())
      onClose()
    }catch(e:any){
      setError(e.message||'Could not save this transaction.')
    }finally{
      setSaving(false)
    }
  }

  const isIncome=form.entry_type==='income'
  const isTransfer=form.entry_type==='transfer'
  const upiUnavailable=!isTransfer&&form.payment_method==='upi'&&!bankAccounts.length
  const transferUnavailable=isTransfer&&bankAccounts.length<2
  const invalidTransfer=isTransfer&&Boolean(form.account_id&&form.to_account_id&&form.account_id===form.to_account_id)

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
          value={form.entry_type}
          disabled={saving}
          onChange={(_,value:EntryType|null)=>{if(value)setEntryType(value)}}
        >
          <ToggleButton value="income">Income</ToggleButton>
          <ToggleButton value="expense">Expense</ToggleButton>
          <ToggleButton value="transfer">Transfer</ToggleButton>
        </ToggleButtonGroup>

        {isTransfer?<>
          <Alert severity="info">
            Transfers between your own accounts do not count as income or spending. Each bank statement can reconcile its side independently.
          </Alert>

          {transferUnavailable&&<Alert severity="warning">
            Add at least two active bank accounts before recording an own-account transfer.
          </Alert>}

          <FormControl size="small" disabled={saving||transferUnavailable}>
            <InputLabel>From account</InputLabel>
            <Select
              label="From account"
              value={form.account_id}
              onChange={e=>{
                const from=String(e.target.value)
                const to=form.to_account_id===from
                  ? String(bankAccounts.find((account:any)=>String(account.id)!==from)?.id||'')
                  : form.to_account_id
                setForm({...form,account_id:from,to_account_id:to})
              }}
            >
              {bankAccounts.map((account:any)=><MenuItem key={account.id} value={String(account.id)}>
                {account.name}
              </MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" disabled={saving||transferUnavailable}>
            <InputLabel>To account</InputLabel>
            <Select
              label="To account"
              value={form.to_account_id}
              onChange={e=>setForm({...form,to_account_id:String(e.target.value)})}
            >
              {bankAccounts
                .filter((account:any)=>String(account.id)!==form.account_id)
                .map((account:any)=><MenuItem key={account.id} value={String(account.id)}>
                  {account.name}
                </MenuItem>)}
            </Select>
          </FormControl>

          {invalidTransfer&&<Alert severity="error">Source and destination accounts must be different.</Alert>}
        </>:<>
          <Stack spacing={.6}>
            <Typography variant="caption" color="text.secondary">PAYMENT METHOD</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={form.payment_method}
              disabled={saving}
              onChange={(_,value:'cash'|'upi'|'credit_card'|null)=>{if(value)setPaymentMethod(value)}}
            >
              <ToggleButton value="cash">Cash</ToggleButton>
              <ToggleButton value="upi">UPI</ToggleButton>
              {!isIncome&&<ToggleButton value="credit_card">Credit card</ToggleButton>}
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

          {form.payment_method==='credit_card'&&<FormControl size="small" disabled={saving||!cards.length}>
            <InputLabel>Credit card</InputLabel>
            <Select
              label="Credit card"
              value={form.credit_card_id}
              onChange={e=>setForm({...form,credit_card_id:String(e.target.value)})}
            >
              {cards.map((card:any)=><MenuItem key={card.id} value={String(card.id)}>
                {card.lender} · {new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(card.outstanding_balance)} outstanding
              </MenuItem>)}
            </Select>
          </FormControl>}

          {upiUnavailable&&<Alert severity="warning">
            Add a bank account first before recording a manual UPI transaction.
          </Alert>}

          {form.payment_method==='credit_card'&&!cards.length&&<Alert severity="warning">
            Add a credit card in Liabilities before recording a card purchase.
          </Alert>}
          {form.payment_method==='credit_card'&&cards.length>0&&<Alert severity="info">
            This purchase increases the selected card outstanding but does not reduce your available bank or cash balance.
          </Alert>}
        </>}

        <TextField
          label="Amount"
          type="number"
          inputProps={{inputMode:'decimal',min:0,step:.01}}
          value={form.amount}
          disabled={saving}
          onChange={e=>setForm({...form,amount:e.target.value})}
        />

        {!isTransfer&&<FormControl size="small">
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={form.category}
            disabled={saving}
            onChange={e=>setForm({...form,category:String(e.target.value)})}
          >
            {cats.map((category:any)=><MenuItem key={category.name} value={category.name}>{category.name}</MenuItem>)}
          </Select>
        </FormControl>}

        {!isTransfer&&<TextField
          label="Merchant / paid to"
          value={form.merchant}
          disabled={saving}
          onChange={e=>setForm({...form,merchant:e.target.value})}
        />}

        <TextField
          label="Date & time"
          type="datetime-local"
          value={form.txn_at}
          disabled={saving}
          InputLabelProps={{shrink:true}}
          onChange={e=>setForm({...form,txn_at:e.target.value})}
        />

        <TextField
          label={isTransfer?'Transfer note':'Description / note'}
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
          saving||
          transferUnavailable||
          invalidTransfer||
          (isTransfer&&(!form.account_id||!form.to_account_id))||
          (!isTransfer&&!form.category)||
          (!isTransfer&&form.payment_method==='upi'&&!form.account_id)||
          (!isTransfer&&form.payment_method==='credit_card'&&!form.credit_card_id)
        }
      >
        {saving?'Saving…':isTransfer?'Save transfer':isIncome?'Save income':'Save expense'}
      </Button>
    </DialogActions>
  </Dialog>
}
