import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {api} from '../api/client'
import {usePeriod} from '../period'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'
import FinanceResponse,{FinanceHighlights} from '../components/FinanceResponse'
import {useAppData} from '../appData'

type AIHistoryItem={
  id:number
  title:string
  question:string
  response_preview?:string
  response?:string
  provider?:string|null
  model?:string|null
  provider_user_id:number
  family_scope:string
  family_user_id?:number|null
  from_date?:string|null
  to_date?:string|null
  created_at?:string|null
}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',
  currency:'INR',
  maximumFractionDigits:0,
}).format(n)

export default function AIInsights(){
  const {period}=usePeriod()
  const {resolvedMode}=useUI()
  const {familyScope,familyUserId,scopeLabel,linkedUsers}=useFamily()
  const {aiSettings:settings,aiCapabilities}=useAppData()
  const [q,setQ]=useState(()=>sessionStorage.getItem('ledger_ai_prompt')||'Where did I spend more this month?')
  const [answer,setAnswer]=useState('')
  const [calculated,setCalculated]=useState<any>(null)
  const [busy,setBusy]=useState(false)
  const [providerUserId,setProviderUserId]=useState<number|''>('')
  const [history,setHistory]=useState<AIHistoryItem[]>([])
  const [historyQuery,setHistoryQuery]=useState('')
  const [historyBusy,setHistoryBusy]=useState(false)
  const [selectedHistoryId,setSelectedHistoryId]=useState<number|null>(null)
  const [error,setError]=useState('')

  const familyMember=familyUserId?linkedUsers.find(user=>user.id===familyUserId):undefined
  const aggregateFamilyScope=!familyUserId&&familyScope!=='self'
  const familyAIAllowed=!familyUserId||!!familyMember?.shared_with_me.ai_insights

  const providers=useMemo(()=>{
    const rows=(aiCapabilities?.providers||[]).filter((provider:any)=>provider.ai_insights)
    if(!familyUserId)return rows
    return rows.filter((provider:any)=>provider.own||provider.user_id===familyUserId)
  },[aiCapabilities,familyUserId])

  const selectedProvider=providers.find((provider:any)=>provider.user_id===providerUserId)

  useEffect(()=>{
    const saved=sessionStorage.getItem('ledger_ai_prompt')
    if(saved){
      setQ(saved)
      sessionStorage.removeItem('ledger_ai_prompt')
    }
  },[])

  useEffect(()=>{
    if(providerUserId&&providers.some((provider:any)=>provider.user_id===providerUserId))return
    const own=providers.find((provider:any)=>provider.own)
    setProviderUserId((own||providers[0])?.user_id||'')
  },[providers,providerUserId])

  async function loadHistory(){
    try{
      const result=await api.aiHistory()
      setHistory(result.items||[])
    }catch{
      setHistory([])
    }
  }

  useEffect(()=>{loadHistory()},[])

  async function ask(){
    setBusy(true)
    setError('')
    setAnswer('')
    setCalculated(null)
    setSelectedHistoryId(null)
    try{
      const r=await api.askAI(
        q,
        period.from,
        period.to,
        familyScope,
        familyUserId,
        providerUserId?Number(providerUserId):undefined,
      )
      setAnswer(r.answer)
      setCalculated(r.calculated||null)
      setSelectedHistoryId(r.history_id||null)
      await loadHistory()
    }catch(e:any){
      setError(e.message||'Could not generate AI insights.')
    }finally{
      setBusy(false)
    }
  }

  async function openHistory(id:number){
    setHistoryBusy(true)
    setError('')
    try{
      const item=await api.aiHistoryDetail(id)
      setSelectedHistoryId(id)
      setQ(item.question)
      setAnswer(item.response)
      setCalculated(null)
    }catch(e:any){
      setError(e.message||'Could not open this AI response.')
    }finally{
      setHistoryBusy(false)
    }
  }

  async function removeHistory(id:number){
    try{
      await api.deleteAIHistory(id)
      if(selectedHistoryId===id){
        setSelectedHistoryId(null)
        setAnswer('')
        setCalculated(null)
      }
      await loadHistory()
    }catch(e:any){
      setError(e.message||'Could not delete this AI response.')
    }
  }

  async function clearHistory(){
    if(!window.confirm('Delete all of your saved AI response history?'))return
    try{
      await api.clearAIHistory()
      setHistory([])
      setSelectedHistoryId(null)
      setAnswer('')
      setCalculated(null)
    }catch(e:any){
      setError(e.message||'Could not clear AI history.')
    }
  }

  const filteredHistory=useMemo(()=>{
    const needle=historyQuery.trim().toLowerCase()
    if(!needle)return history
    return history.filter(item=>
      item.title.toLowerCase().includes(needle)||
      item.question.toLowerCase().includes(needle)||
      (item.response_preview||'').toLowerCase().includes(needle)
    )
  },[history,historyQuery])

  const clay=claySx(resolvedMode)
  const canAsk=
    !busy&&
    !!q.trim()&&
    !aggregateFamilyScope&&
    familyAIAllowed&&
    providers.length>0&&
    !!providerUserId

  return <Stack spacing={2.2}>
    <Paper sx={{...clay,p:1.6}}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
        <Chip
          icon={<AutoAwesomeRoundedIcon/>}
          color={providers.length?'primary':'default'}
          label={selectedProvider
            ? `AI via ${selectedProvider.name} · ${selectedProvider.provider==='local'?'Local AI':'Gemini'}`
            : settings.status==='configured'
              ? 'AI configured'
              : 'AI not available'}
        />
        <Typography variant="body2" color="text.secondary">
          Finance-only assistant. Family AI access never exposes provider credentials, and saved AI history is private to the person who asked.
        </Typography>
      </Stack>
    </Paper>

    <Box>
      <Typography variant="overline" color="text.secondary">{scopeLabel.toUpperCase()} · READ-ONLY</Typography>
      <Typography variant="h1">AI Insights</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>
        Exact calculations come from Ledger. Account numbers, IFSC codes, UPI IDs and raw statements are never included in this chat context.
      </Typography>
    </Box>

    {aggregateFamilyScope&&<Alert severity="info">
      For AI Insights, select Self or one specific family member. Aggregate Family / Self + Family analysis is intentionally disabled so one person's financial data is never routed through another family member's shared AI provider.
    </Alert>}

    {familyUserId&&!familyAIAllowed&&<Alert severity="warning">
      {scopeLabel} has not shared AI Insights with you. Their shared financial data remains viewable according to the normal family permissions, but it cannot be sent to AI.
    </Alert>}

    {error&&<Alert severity="error">{error}</Alert>}

    <Box sx={{
      display:'grid',
      gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 340px'},
      gap:2,
      alignItems:'start',
    }}>
      <Paper sx={{...clay,p:{xs:1.5,sm:2.2},minWidth:0}}>
        <Stack spacing={1.5}>
          {providers.length>0&&<TextField
            select
            size="small"
            label="AI provider"
            value={providerUserId}
            onChange={e=>setProviderUserId(Number(e.target.value))}
            sx={{maxWidth:{sm:360}}}
          >
            {providers.map((provider:any)=><MenuItem key={provider.user_id} value={provider.user_id}>
              {provider.name} · {provider.provider==='local'?'Local AI':'Gemini'} · {provider.model}
            </MenuItem>)}
          </TextField>}

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
              disabled={!canAsk}
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
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="overline" color="text.secondary">
                  {selectedHistoryId&&calculated===null?'SAVED RESPONSE':'CURRENT RESPONSE'}
                </Typography>
                {selectedHistoryId&&calculated===null&&<Button
                  size="small"
                  startIcon={<RefreshRoundedIcon/>}
                  onClick={ask}
                  disabled={!canAsk}
                >
                  Ask again with current data
                </Button>}
              </Stack>
              {calculated&&<FinanceHighlights items={[
                {label:'Income',value:money(calculated.period_income??0)},
                {label:'Spent',value:money(calculated.period_spending??0)},
                {label:'Available',value:money(calculated.available??0)},
                ...(calculated.overspent_by>0?[{label:'Overspent',value:money(calculated.overspent_by)}]:[]),
                ...(calculated.debt?.total_outstanding>0?[{label:'Debt',value:money(calculated.debt.total_outstanding)}]:[]),
              ]}/>}
              <FinanceResponse text={answer}/>
            </Stack>
          </Paper>}

          {!providers.length&&!aggregateFamilyScope&&<Alert severity="info">
            Configure AI in Settings, or use a family member who has explicitly shared the required AI capability with you.
          </Alert>}
        </Stack>
      </Paper>

      <Paper sx={{...clay,p:1.4,minWidth:0}}>
        <Stack spacing={1.1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Stack direction="row" spacing={.75} alignItems="center">
              <HistoryRoundedIcon color="primary" fontSize="small"/>
              <Typography variant="h2">History</Typography>
            </Stack>
            {!!history.length&&<Button size="small" color="error" onClick={clearHistory}>Clear all</Button>}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Private to you. Ledger stores the question, response and metadata—not the full financial context sent to AI.
          </Typography>

          <TextField
            size="small"
            value={historyQuery}
            onChange={e=>setHistoryQuery(e.target.value)}
            placeholder="Search AI history"
          />

          <Stack spacing={.75} sx={{maxHeight:{lg:620},overflowY:{lg:'auto'},pr:{lg:.25}}}>
            {filteredHistory.map(item=><Box
              key={item.id}
              onClick={()=>openHistory(item.id)}
              sx={{
                p:1,
                borderRadius:1.75,
                border:'1px solid',
                borderColor:selectedHistoryId===item.id?'primary.main':'divider',
                bgcolor:selectedHistoryId===item.id?'action.selected':'transparent',
                cursor:'pointer',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={.75}>
                <Box sx={{minWidth:0}}>
                  <Typography variant="body2" fontWeight={800} noWrap title={item.title}>{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.2}}>
                    {item.created_at?new Date(item.created_at).toLocaleString('en-IN'):'Saved response'}
                  </Typography>
                </Box>
                <Tooltip title="Delete response">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={e=>{e.stopPropagation();removeHistory(item.id)}}
                    aria-label="Delete AI history response"
                  >
                    <DeleteOutlineRoundedIcon fontSize="small"/>
                  </IconButton>
                </Tooltip>
              </Stack>
              {item.response_preview&&<Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display:'-webkit-box',
                  WebkitLineClamp:2,
                  WebkitBoxOrient:'vertical',
                  overflow:'hidden',
                  mt:.55,
                }}
              >
                {item.response_preview}
              </Typography>}
              <Stack direction="row" gap={.5} sx={{mt:.7,flexWrap:'wrap'}}>
                {item.provider&&<Chip size="small" variant="outlined" label={item.provider}/>}
                {item.family_user_id&&<Chip size="small" variant="outlined" label="Family data"/>}
              </Stack>
            </Box>)}

            {!filteredHistory.length&&<Typography variant="body2" color="text.secondary" sx={{py:2,textAlign:'center'}}>
              {historyBusy?'Loading response…':history.length?'No history matches your search.':'No AI responses saved yet.'}
            </Typography>}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  </Stack>
}
