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
} from '@mui/material'
import {api} from '../api/client'

const defaults=['Food & Dining','Fuel','Groceries','EMI & Loans','Shopping','Bills & Subscriptions','Travel','Health','Payroll','Investments','Other']

const initialForm=()=>({
  amount:'',
  direction:'debit' as 'credit'|'debit',
  category:'Food & Dining',
  txn_at:new Date().toISOString().slice(0,16),
  note:''
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
  const [cats,setCats]=useState<any[]>([])
  const [form,setForm]=useState(initialForm)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(open){
      setError('')
      api.categories().then(x=>setCats(x.length?x:defaults.map(name=>({name}))))
    }
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

  async function save(){
    if(saving||!form.amount)return
    setSaving(true)
    setError('')
    try{
      await api.cash({
        ...form,
        amount:Number(form.amount),
        txn_at:new Date(form.txn_at).toISOString()
      })
      await onSaved()
      setForm(initialForm())
      onClose()
    }catch(e:any){
      setError(e.message||'Could not save this cash transaction.')
    }finally{
      setSaving(false)
    }
  }

  const isIncome=form.direction==='credit'

  return <Dialog
    open={open}
    onClose={saving?undefined:onClose}
    fullWidth
    maxWidth="xs"
    PaperProps={{sx:{borderRadius:4}}}
  >
    <DialogTitle>Add cash transaction</DialogTitle>
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
            {cats.map((c:any)=><MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          label="Date"
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
      <Button variant="contained" onClick={save} disabled={!form.amount||saving}>
        {saving?'Saving…':isIncome?'Save income':'Save expense'}
      </Button>
    </DialogActions>
  </Dialog>
}
