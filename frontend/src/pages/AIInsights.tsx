import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {api} from '../api/client'
import {usePeriod} from '../period'
import {claySx,useUI} from '../ui'
import FinanceResponse,{FinanceHighlights} from '../components/FinanceResponse'

export default function AIInsights(){
  const {period}=usePeriod()
  const {resolvedMode}=useUI()
  const [settings,setSettings]=useState<any>({status:'not_configured'})
  const [q,setQ]=useState(()=>sessionStorage.getItem('ledger_ai_prompt')||'Where did I spend more this month?')
  const [answer,setAnswer]=useState('')
  const [calculated,setCalculated]=useState<any>(null)
  const [busy,setBusy]=useState(false)

  useEffect(()=>{
    api.aiSettings().then(setSettings)
    const saved=sessionStorage.getItem('ledger_ai_prompt')
    if(saved){
      setQ(saved)
      sessionStorage.removeItem('ledger_ai_prompt')
    }
  },[])

  async function ask(){
    setBusy(true)
    setAnswer('')
    setCalculated(null)
    try{
      const r=await api.askAI(q,period.from,period.to)
      setAnswer(r.answer)
      setCalculated(r.calculated||null)
    }catch(e:any){
      setAnswer(e.message)
    }finally{
      setBusy(false)
    }
  }

  const clay=claySx(resolvedMode)

  return <Stack spacing={2.2}>
    <Paper sx={{...clay,p:1.6}}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
        <Chip
          icon={<AutoAwesomeRoundedIcon/>}
          color={settings.status==='configured'?'primary':'default'}
          label={settings.status==='configured'?(settings.provider==='local'?'Local AI':'Gemini'):'AI not configured'}
        />
        <Typography variant="body2" color="text.secondary">Finance-only assistant: spending, income, budgets, debt, EMI and cash flow. Coding and general-knowledge requests are rejected.</Typography>
      </Stack>
    </Paper>

    <Box>
      <Typography variant="overline" color="text.secondary">READ-ONLY</Typography>
      <Typography variant="h1">AI Insights</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>Exact calculations come from Ledger. Account numbers, IFSC codes, UPI IDs and raw statements are never included in this chat context.</Typography>
    </Box>

    <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
      <Stack spacing={1.5}>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          <TextField
            fullWidth
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Ask about spending, income, budgets or debt…"
          />
          <Button
            variant="contained"
            onClick={ask}
            disabled={busy||settings.status!=='configured'||!q.trim()}
            sx={{minWidth:{sm:110}}}
          >
            {busy?'Analyzing…':'Ask'}
          </Button>
        </Stack>

        <Stack direction="row" gap={1} sx={{flexWrap:'wrap'}}>
          {[
            'Compare this month with last month',
            'Find unusual expenses',
            'Where is most of my spending going?',
            'How can I improve my finances and reduce debt?'
          ].map(prompt=><Chip key={prompt} label={prompt} onClick={()=>setQ(prompt)} variant="outlined"/>)}
        </Stack>

        {answer&&<Paper variant="outlined" sx={{p:{xs:1.5,sm:2.2},borderRadius:3,bgcolor:'action.hover'}}>
          <Stack spacing={1.6}>
            {calculated&&<FinanceHighlights items={[
              {label:'Income',value:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(calculated.period_income??0)},
              {label:'Spent',value:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(calculated.period_spending??0)},
              {label:'Available',value:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(calculated.available??0)},
              ...(calculated.overspent_by>0?[{label:'Overspent',value:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(calculated.overspent_by)}]:[]),
              ...(calculated.debt?.total_outstanding>0?[{label:'Debt',value:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(calculated.debt.total_outstanding)}]:[]),
            ]}/>}
            <FinanceResponse text={answer}/>
          </Stack>
        </Paper>}

        {settings.status!=='configured'&&<Alert severity="info">Connect a local OpenAI-compatible model or Gemini in Settings to enable analysis.</Alert>}
      </Stack>
    </Paper>
  </Stack>
}
