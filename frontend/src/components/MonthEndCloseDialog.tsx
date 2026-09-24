import {useEffect,useState} from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import {api} from '../api/client'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',
  currency:'INR',
  maximumFractionDigits:0,
}).format(n)

export default function MonthEndCloseDialog({
  open,
  monthKey,
  monthLabel,
  onClose,
  onClosed,
}:{
  open:boolean
  monthKey:string
  monthLabel:string
  onClose:()=>void
  onClosed:()=>void|Promise<void>
}){
  const [step,setStep]=useState(0)
  const [data,setData]=useState<any>(null)
  const [bank,setBank]=useState('')
  const [cash,setCash]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [acknowledged,setAcknowledged]=useState(false)

  async function load(){
    setError('')
    try{
      const result=await api.prepareMonthlyClose(monthKey)
      setData(result)
      if(result?.month_end_balance){
        setBank(String(result.month_end_balance.bank_balance??''))
        setCash(String(result.month_end_balance.cash_balance??''))
      }else{
        setBank('')
        setCash('')
      }
      if(result?.already_closed)setStep(3)
      return result
    }catch(e:any){
      setError(e.message||'Could not prepare this month for closing.')
      return null
    }
  }

  useEffect(()=>{
    if(!open)return
    setStep(0)
    setAcknowledged(false)
    setData(null)
    setError('')
    load()
  },[open,monthKey])

  async function saveBalances(){
    if(Number(bank||0)<0||Number(cash||0)<0)return
    setBusy(true)
    setError('')
    try{
      await api.saveMonthEndBalance(monthKey,{
        bank_balance:Number(bank||0),
        cash_balance:Number(cash||0),
      })
      await load()
      setStep(2)
    }catch(e:any){
      setError(e.message||'Could not save month-end balances.')
    }finally{
      setBusy(false)
    }
  }

  async function closeMonth(){
    setBusy(true)
    setError('')
    try{
      await api.createMonthlyClose(monthKey)
      await load()
      setStep(3)
      await onClosed()
    }catch(e:any){
      setError(e.message||'Could not close this month.')
    }finally{
      setBusy(false)
    }
  }

  const reviewCount=(data?.review_transactions||0)+(data?.reconciliation_review||0)
  const summary=data?.close||data?.summary
  const closeSummary=data?.close
  const closingBank=closeSummary?.closing_bank_balance??data?.month_end_balance?.bank_balance
  const closingCash=closeSummary?.closing_cash_balance??data?.month_end_balance?.cash_balance
  const closingTotal=closeSummary?.closing_balance??data?.month_end_balance?.total
  const stepLabels=['Review records','Month-end balance','Preview & close']

  return <Dialog
    open={open}
    onClose={busy?undefined:onClose}
    fullWidth
    maxWidth="sm"
    PaperProps={{sx:{borderRadius:3}}}
  >
    <DialogTitle>{data?.already_closed?monthLabel+' closed':'Close '+monthLabel}</DialogTitle>
    <DialogContent>
      {!data&&!error?<Stack spacing={1.2}>
        <Skeleton variant="rounded" height={52}/>
        <Skeleton variant="rounded" height={150}/>
      </Stack>:<>
        {step<3&&<Stepper activeStep={step} alternativeLabel sx={{mb:2.5}}>
          {stepLabels.map(label=><Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>}

        {error&&<Paper variant="outlined" sx={{p:1.4,borderColor:'error.main',mb:1.5}}>
          <Typography fontWeight={800} color="error.main">Could not continue</Typography>
          <Typography variant="body2" color="text.secondary" sx={{mt:.3}}>{error}</Typography>
        </Paper>}

        {step===0&&data&&<Stack spacing={1.5}>
          <Box>
            <Typography fontWeight={850}>1. Review the month</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
              Check anything that still needs verification before you freeze the month.
            </Typography>
          </Box>

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1}}>
            <Paper variant="outlined" sx={{p:1.4,borderRadius:2}}>
              <Typography variant="caption" color="text.secondary">TRANSACTIONS TO REVIEW</Typography>
              <Typography sx={{fontSize:'1.5rem',fontWeight:850,mt:.2}}>{data.review_transactions||0}</Typography>
              {(data.review_transactions||0)>0&&<Button
                size="small"
                sx={{mt:.6}}
                onClick={()=>window.location.assign('/#/transactions?status=review')}
              >
                Review transactions
              </Button>}
            </Paper>
            <Paper variant="outlined" sx={{p:1.4,borderRadius:2}}>
              <Typography variant="caption" color="text.secondary">RECONCILIATION ITEMS</Typography>
              <Typography sx={{fontSize:'1.5rem',fontWeight:850,mt:.2}}>{data.reconciliation_review||0}</Typography>
              {(data.reconciliation_review||0)>0&&<Button
                size="small"
                sx={{mt:.6}}
                onClick={()=>window.location.assign('/#/import?tab=reconciliation')}
              >
                Open reconciliation
              </Button>}
            </Paper>
          </Box>

          <Paper variant="outlined" sx={{p:1.4,borderRadius:2}}>
            <Typography variant="body2" fontWeight={800}>
              {reviewCount===0?'Your records are ready for the next step.':reviewCount+' item'+(reviewCount===1?'':'s')+' still need attention.'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              You can come back to this close flow after reviewing them.
            </Typography>
          </Paper>
        </Stack>}

        {step===1&&data&&<Stack spacing={1.5}>
          <Box>
            <Typography fontWeight={850}>2. Enter the actual month-end balance</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
              Use the balances shown by your bank accounts and the cash you physically had at the end of {monthLabel}.
            </Typography>
          </Box>

          {!data.month_end_balance_confirmed&&data.month_end_balance&&<Paper variant="outlined" sx={{p:1.35,borderRadius:2}}>
            <Typography variant="caption" color="text.secondary">LEDGER ESTIMATE</Typography>
            <Typography variant="body2" fontWeight={800} sx={{mt:.25}}>
              Bank {money(data.month_end_balance.bank_balance)} · Cash {money(data.month_end_balance.cash_balance)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This is only a calculated estimate. Confirm it against your actual month-end balances below.
            </Typography>
          </Paper>}

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1.2}}>
            <TextField
              autoFocus
              label="Total bank balance"
              type="number"
              value={bank}
              onChange={e=>setBank(e.target.value)}
              inputProps={{min:0,step:.01,inputMode:'decimal'}}
              helperText="Total across your own bank accounts"
            />
            <TextField
              label="Cash in hand"
              type="number"
              value={cash}
              onChange={e=>setCash(e.target.value)}
              inputProps={{min:0,step:.01,inputMode:'decimal'}}
              helperText="Physical cash at month end"
            />
          </Box>

          <Paper variant="outlined" sx={{p:1.35,borderRadius:2}}>
            <Typography variant="caption" color="text.secondary">CLOSING LIQUID BALANCE</Typography>
            <Typography sx={{fontSize:'1.45rem',fontWeight:850,mt:.2}}>
              {money(Number(bank||0)+Number(cash||0))}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Saving this creates a historical month-end snapshot only. It does not overwrite today’s available balance.
            </Typography>
          </Paper>
        </Stack>}

        {step===2&&data&&<Stack spacing={1.5}>
          <Box>
            <Typography fontWeight={850}>3. Preview before closing</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
              Ledger calculated these figures from the month’s transactions and your confirmed closing balance.
            </Typography>
          </Box>

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',sm:'repeat(3,1fr)'},gap:1}}>
            {[
              ['Opening',summary?.opening_balance],
              ['Income',summary?.income],
              ['Bank / cash spend',summary?.liquid_spending],
              ['Card spend',summary?.credit_card_spending],
              ['Investments',summary?.investments],
              ['Savings',summary?.savings],
            ].map(([label,value])=><Paper key={String(label)} variant="outlined" sx={{p:1.2,borderRadius:2}}>
              <Typography variant="caption" color="text.secondary">{String(label).toUpperCase()}</Typography>
              <Typography variant="body2" fontWeight={850} sx={{mt:.2}}>
                {value==null?'—':money(Number(value))}
              </Typography>
            </Paper>)}
          </Box>

          <Paper variant="outlined" sx={{p:1.4,borderRadius:2}}>
            <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="caption" color="text.secondary">CONFIRMED MONTH-END BALANCE</Typography>
                <Typography fontWeight={850} sx={{mt:.2}}>
                  {closingTotal==null?'—':money(Number(closingTotal))}
                </Typography>
              </Box>
              <Box sx={{textAlign:{xs:'left',sm:'right'}}}>
                <Typography variant="caption" color="text.secondary">
                  Bank {closingBank==null?'—':money(Number(closingBank))} · Cash {closingCash==null?'—':money(Number(closingCash))}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {reviewCount>0&&<Paper variant="outlined" sx={{p:1.35,borderRadius:2,borderColor:'warning.main'}}>
            <Typography variant="body2" fontWeight={800}>
              {reviewCount} review item{reviewCount===1?' remains':'s remain'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.25}}>
              Closing will lock the reporting snapshot even though those records still need review.
            </Typography>
            <FormControlLabel
              sx={{mt:.5}}
              control={<Checkbox checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>}
              label="I understand and want to close this month anyway"
            />
          </Paper>}
        </Stack>}

        {step===3&&data&&<Stack spacing={1.5}>
          <Chip label="MONTH CLOSED" color="primary" sx={{alignSelf:'flex-start',fontWeight:800}}/>
          <Box>
            <Typography variant="h2">{monthLabel} is closed</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mt:.5}}>
              The reporting snapshot is now immutable. Future current-balance updates will not change this closed month.
            </Typography>
          </Box>
          {data.close&&<Paper variant="outlined" sx={{p:1.5,borderRadius:2}}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="caption" color="text.secondary">CLOSING BALANCE</Typography>
                <Typography sx={{fontSize:'1.5rem',fontWeight:850}}>{money(data.close.closing_balance)}</Typography>
              </Box>
              <Box sx={{textAlign:'right'}}>
                <Typography variant="caption" color="text.secondary">SAVINGS</Typography>
                <Typography fontWeight={850}>{money(data.close.savings)}</Typography>
              </Box>
            </Stack>
          </Paper>}
        </Stack>}
      </>}
    </DialogContent>

    <DialogActions sx={{p:2}}>
      {step===0&&<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={()=>setStep(1)} disabled={!data}>Continue</Button>
      </>}
      {step===1&&<>
        <Button onClick={()=>setStep(0)} disabled={busy}>Back</Button>
        <Button
          variant="contained"
          onClick={saveBalances}
          disabled={busy||bank===''||cash===''||Number(bank)<0||Number(cash)<0}
        >
          {busy?'Saving…':'Save month-end balance'}
        </Button>
      </>}
      {step===2&&<>
        <Button onClick={()=>setStep(1)} disabled={busy}>Back</Button>
        <Button
          variant="contained"
          onClick={closeMonth}
          disabled={busy||!data?.month_end_balance_confirmed||(reviewCount>0&&!acknowledged)}
        >
          {busy?'Closing…':'Close '+monthLabel}
        </Button>
      </>}
      {step===3&&<Button variant="contained" onClick={onClose}>Done</Button>}
    </DialogActions>
  </Dialog>
}
