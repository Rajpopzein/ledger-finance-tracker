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

export default function AIInsights(){
  const {period}=usePeriod()
  const {resolvedMode}=useUI()
  const [settings,setSettings]=useState<any>({status:'not_configured'})
  const [q,setQ]=useState('Where did I spend more this month?')
  const [answer,setAnswer]=useState('')
  const [busy,setBusy]=useState(false)

  useEffect(()=>{api.aiSettings().then(setSettings)},[])

  async function ask(){
    setBusy(true)
    setAnswer('')
    try{
      const r=await api.askAI(q,period.from,period.to)
      setAnswer(r.answer)
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
        <Typography variant="body2" color="text.secondary">AI can analyze and explain your finances, but it cannot modify transactions.</Typography>
      </Stack>
    </Paper>

    <Box>
      <Typography variant="overline" color="text.secondary">READ-ONLY</Typography>
      <Typography variant="h1">AI Insights</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>Exact calculations come from the finance service; AI only explains them.</Typography>
    </Box>

    <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
      <Stack spacing={1.5}>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          <TextField
            fullWidth
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Ask about your finances…"
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
            'Where is most of my spending going?'
          ].map(prompt=><Chip key={prompt} label={prompt} onClick={()=>setQ(prompt)} variant="outlined"/>)}
        </Stack>

        {answer&&<Paper variant="outlined" sx={{p:2,borderRadius:3,bgcolor:'action.hover'}}>
          <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{answer}</Typography>
        </Paper>}

        {settings.status!=='configured'&&<Alert severity="info">Connect a local OpenAI-compatible model or Gemini in Settings to enable analysis.</Alert>}
      </Stack>
    </Paper>
  </Stack>
}
