import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',
  currency:'INR',
  maximumFractionDigits:2,
}).format(n)

type BillForm={
  merchant:string
  amount:string
  date:string
  category:string
  paymentMethod:string
  accountId:string
  creditCardId:string
  note:string
}

const today=()=>new Date().toISOString().slice(0,10)

export default function BillImport(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const [accounts,setAccounts]=useState<any[]>([])
  const [categories,setCategories]=useState<any[]>([])
  const [cards,setCards]=useState<any[]>([])
  const [preview,setPreview]=useState<any>(null)
  const [fileName,setFileName]=useState('')
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [form,setForm]=useState<BillForm>({
    merchant:'',
    amount:'',
    date:today(),
    category:'Other',
    paymentMethod:'',
    accountId:'',
    creditCardId:'',
    note:'',
  })

  const bankAccounts=useMemo(
    ()=>accounts.filter(a=>a.type==='bank'),
    [accounts],
  )

  useEffect(()=>{
    let active=true
    Promise.all([api.accounts(),api.categories(),api.debts()])
      .then(([accountRows,categoryRows,debtResult])=>{
        if(!active)return
        const nextAccounts=accountRows||[]
        const nextCards=(debtResult?.items||[]).filter((d:any)=>d.debt_type==='credit_card'&&d.status==='active')
        setAccounts(nextAccounts)
        setCategories(categoryRows||[])
        setCards(nextCards)
      })
      .catch((e:any)=>{if(active)setError(e.message||'Could not load bill settings.')})
    return ()=>{active=false}
  },[])

  async function pick(file:File){
    setBusy('preview')
    setError('')
    setNotice('')
    setPreview(null)
    setFileName(file.name)
    try{
      const result=await api.billAIPreview(file)
      const p=result?.preview||{}
      const suggested=['cash','upi','bank','credit_card'].includes(p.payment_method_suggestion)
        ? p.payment_method_suggestion
        : ''
      setPreview(result)
      setForm({
        merchant:p.merchant||'',
        amount:p.total_amount!=null?String(p.total_amount):'',
        date:p.bill_date||today(),
        category:p.category||'Other',
        paymentMethod:suggested,
        accountId:(suggested==='upi'||suggested==='bank')&&bankAccounts.length===1?String(bankAccounts[0].id):'',
        creditCardId:suggested==='credit_card'&&cards.length===1?String(cards[0].id):'',
        note:p.note||'',
      })
    }catch(e:any){
      setError(e.message||'Could not read this bill.')
    }finally{
      setBusy('')
    }
  }

  async function addExpense(){
    setBusy('commit')
    setError('')
    setNotice('')
    try{
      const result=await api.billCommit({
        amount:Number(form.amount),
        payment_method:form.paymentMethod,
        account_id:(form.paymentMethod==='upi'||form.paymentMethod==='bank')?Number(form.accountId):null,
        credit_card_id:form.paymentMethod==='credit_card'?Number(form.creditCardId):null,
        category:form.category,
        txn_at:new Date(`${form.date}T12:00:00`).toISOString(),
        merchant:form.merchant.trim(),
        note:form.note.trim()||null,
        source_file_name:preview?.file_name||fileName||null,
        source_hash:preview?.file_hash||null,
      })
      setNotice(result?.message||'Expense added from bill.')
      if(!result?.duplicate){
        setPreview(null)
        setFileName('')
        setForm({
          merchant:'',
          amount:'',
          date:today(),
          category:'Other',
          paymentMethod:'',
          accountId:'',
          creditCardId:'',
          note:'',
        })
      }
    }catch(e:any){
      setError(e.message||'Could not add this bill expense.')
    }finally{
      setBusy('')
    }
  }

  const needsBank=(form.paymentMethod==='upi'||form.paymentMethod==='bank')
  const needsCard=form.paymentMethod==='credit_card'
  const canCommit=Boolean(
    preview&&
    form.merchant.trim()&&
    Number(form.amount)>0&&
    form.date&&
    form.category&&
    form.paymentMethod&&
    (!needsBank||form.accountId)&&
    (!needsCard||form.creditCardId)
  )

  return <Stack spacing={2}>
    <Paper sx={{...clay,p:{xs:1.4,sm:2.1}}}>
      <Stack direction={{xs:'column',md:'row'}} spacing={2} alignItems={{md:'center'}} justifyContent="space-between">
        <Box sx={{minWidth:0}}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ReceiptLongRoundedIcon color="primary"/>
            <Typography variant="h2">Add expense from a bill</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{mt:.6}}>
            Upload a receipt, invoice or bill. AI extracts the merchant, date, total and category, then you review it before Ledger adds the expense.
          </Typography>
        </Box>
        <Button
          component="label"
          variant="contained"
          startIcon={<CloudUploadRoundedIcon/>}
          disabled={Boolean(busy)}
          sx={{flex:'0 0 auto'}}
        >
          {busy==='preview'?'Reading bill…':'Upload bill'}
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf,.txt"
            onChange={e=>{
              const file=e.target.files?.[0]
              if(file)pick(file)
              e.currentTarget.value=''
            }}
          />
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>
        JPG, PNG, WEBP, PDF or TXT · up to 10 MB · uploaded file is not stored after extraction.
      </Typography>
    </Paper>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    {preview&&<Paper sx={{...clay,p:{xs:1.4,sm:2.1}}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1} sx={{mb:2}}>
        <Box>
          <Stack direction="row" spacing={.8} alignItems="center">
            <AutoAwesomeRoundedIcon color="primary" fontSize="small"/>
            <Typography variant="h2">AI bill preview</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">{preview.file_name}</Typography>
        </Box>
        <Stack direction="row" spacing=.8 sx={{flexWrap:'wrap'}}>
          {preview.preview?.confidence!=null&&
            <Chip size="small" variant="outlined" label={`${Math.round(Number(preview.preview.confidence)*100)}% confidence`}/>}
          {preview.preview?.tax_amount!=null&&
            <Chip size="small" variant="outlined" label={`Tax ${money(Number(preview.preview.tax_amount))}`}/>}
        </Stack>
      </Stack>

      <Alert severity="info" sx={{mb:1.5}}>
        Confirm the values and how you paid. Ledger will not create an expense until you press Add expense.
      </Alert>

      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},
        gap:1.35,
      }}>
        <TextField
          label="Merchant"
          value={form.merchant}
          onChange={e=>setForm(v=>({...v,merchant:e.target.value}))}
        />
        <TextField
          label="Total amount"
          type="number"
          value={form.amount}
          onChange={e=>setForm(v=>({...v,amount:e.target.value}))}
          inputProps={{min:0,step:.01,inputMode:'decimal'}}
        />
        <TextField
          label="Bill date"
          type="date"
          value={form.date}
          onChange={e=>setForm(v=>({...v,date:e.target.value}))}
          InputLabelProps={{shrink:true}}
        />
        <TextField
          select
          label="Category"
          value={form.category}
          onChange={e=>setForm(v=>({...v,category:e.target.value}))}
        >
          {categories.map((category:any)=>
            <MenuItem key={category.name} value={category.name}>{category.name}</MenuItem>
          )}
          {!categories.some((category:any)=>category.name==='Other')&&<MenuItem value="Other">Other</MenuItem>}
        </TextField>
        <TextField
          select
          label="Paid using"
          value={form.paymentMethod}
          onChange={e=>setForm(v=>({...v,paymentMethod:e.target.value,accountId:'',creditCardId:''}))}
        >
          <MenuItem value="cash">Cash</MenuItem>
          <MenuItem value="upi">UPI</MenuItem>
          <MenuItem value="bank">Bank / debit card</MenuItem>
          <MenuItem value="credit_card">Credit card</MenuItem>
        </TextField>

        {needsBank&&<TextField
          select
          label="Bank account"
          value={form.accountId}
          onChange={e=>setForm(v=>({...v,accountId:e.target.value}))}
          helperText="Choose the account that actually paid the bill."
        >
          {bankAccounts.map((account:any)=>
            <MenuItem key={account.id} value={String(account.id)}>{account.name}</MenuItem>
          )}
        </TextField>}

        {needsCard&&<TextField
          select
          label="Credit card"
          value={form.creditCardId}
          onChange={e=>setForm(v=>({...v,creditCardId:e.target.value}))}
          helperText="The purchase will also increase this card's outstanding balance."
        >
          {cards.map((card:any)=>
            <MenuItem key={card.id} value={String(card.id)}>{card.lender}</MenuItem>
          )}
        </TextField>}

        <TextField
          label="Note"
          value={form.note}
          onChange={e=>setForm(v=>({...v,note:e.target.value}))}
          multiline
          minRows={2}
          sx={{gridColumn:{sm:'1 / -1'}}}
        />
      </Box>

      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1.2} sx={{mt:2}}>
        <Typography variant="caption" color="text.secondary">
          Duplicate protection links the bill to a matching transaction instead of counting the expense twice.
        </Typography>
        <Button
          variant="contained"
          disabled={!canCommit||Boolean(busy)}
          onClick={addExpense}
          sx={{minWidth:150}}
        >
          {busy==='commit'?'Adding…':'Add expense'}
        </Button>
      </Stack>
    </Paper>}
  </Stack>
}
