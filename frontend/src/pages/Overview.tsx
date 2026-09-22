import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import QuickCash from '../components/QuickCash'
import {api} from '../api/client'
import type {Summary,Tx} from '../types'
import {usePeriod} from '../period'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

function MetricCard({label,value,sub,icon,mode}:{label:string;value:string;sub:string;icon:React.ReactNode;mode:'light'|'dark'}){
  return <Paper sx={{...claySx(mode),p:2.1,minWidth:0}}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
      <Box sx={{minWidth:0}}>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography sx={{fontSize:'clamp(1.35rem,3vw,2rem)',fontWeight:800,letterSpacing:'-.03em',overflowWrap:'anywhere'}}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{sub}</Typography>
      </Box>
      <Box sx={{width:40,height:40,borderRadius:2.5,display:'grid',placeItems:'center',bgcolor:'action.selected',color:'primary.main',flex:'0 0 auto'}}>{icon}</Box>
    </Stack>
  </Paper>
}

function CashFlowCard({s,mode}:{s:Summary;mode:'light'|'dark'}){
  const max=Math.max(1,...s.cashflow.flatMap(x=>[x.income,x.spent]))
  return <Paper sx={{...claySx(mode),p:2.2,height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:2}}>
      <Box><Typography variant="overline" color="text.secondary">6 MONTHS</Typography><Typography variant="h2">Cash flow</Typography></Box>
      <Stack direction="row" spacing={1}>
        <Chip size="small" label="Income" color="primary" variant="outlined"/>
        <Chip size="small" label="Spent" color="secondary" variant="outlined"/>
      </Stack>
    </Stack>
    {s.cashflow.some(x=>x.income||x.spent)
      ? <Box sx={{height:190,display:'grid',gridTemplateColumns:`repeat(${s.cashflow.length},minmax(28px,1fr))`,gap:1,alignItems:'end'}}>
          {s.cashflow.map(m=><Stack key={m.label} alignItems="center" spacing={0.7} sx={{minWidth:0,height:'100%',justifyContent:'flex-end'}}>
            <Stack direction="row" alignItems="flex-end" spacing={0.45} sx={{height:150}}>
              <Box title={`Income ${money(m.income)}`} sx={{width:{xs:7,sm:10},height:`${Math.max(3,m.income/max*145)}px`,borderRadius:'6px 6px 2px 2px',bgcolor:'primary.main'}}/>
              <Box title={`Spent ${money(m.spent)}`} sx={{width:{xs:7,sm:10},height:`${Math.max(3,m.spent/max*145)}px`,borderRadius:'6px 6px 2px 2px',bgcolor:'secondary.main'}}/>
            </Stack>
            <Typography variant="caption" color="text.secondary">{m.label}</Typography>
          </Stack>)}
        </Box>
      : <Typography color="text.secondary">Cash-flow history will appear after you import or add transactions.</Typography>}
  </Paper>
}

function CategoryCard({s,mode}:{s:Summary;mode:'light'|'dark'}){
  return <Paper sx={{...claySx(mode),p:2.2,height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:2}}>
      <Typography variant="h2">Spending by category</Typography>
      <Typography fontWeight={800}>{money(s.spent)}</Typography>
    </Stack>
    <Stack spacing={1.55}>
      {s.categories.slice(0,6).map(c=><Box key={c.name}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="body2" noWrap>{c.name}</Typography>
          <Typography variant="body2" fontWeight={700}>{money(c.amount)}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100,c.amount/(s.spent||1)*100)} sx={{mt:.7,height:7,borderRadius:99}}/>
      </Box>)}
      {!s.categories.length&&<Typography color="text.secondary">No spending in this period.</Typography>}
    </Stack>
  </Paper>
}

function FamilyCard({s,periodLabel,mode}:{s:Summary;periodLabel:string;mode:'light'|'dark'}){
  const max=Math.max(1,...s.family_spending.map(x=>x.amount))
  return <Paper sx={{...claySx(mode),p:2.2,height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:2}}>
      <Typography variant="h2">Spending by family</Typography>
      <Typography variant="caption" color="text.secondary">{periodLabel}</Typography>
    </Stack>
    <Stack spacing={1.5}>
      {s.family_spending.map(member=><Box key={member.id}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{minWidth:0}}>
            <Typography fontWeight={700} noWrap>{member.name}</Typography>
            <Typography variant="caption" color="text.secondary">{member.handle}</Typography>
          </Box>
          <Typography fontWeight={800}>{money(member.amount)}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100,member.amount/max*100)} sx={{mt:.7,height:7,borderRadius:99}}/>
      </Box>)}
      {!s.family_spending.length&&<Typography color="text.secondary">No family spending in this period yet.</Typography>}
    </Stack>
  </Paper>
}

function RecentCard({tx,mode,onAll}:{tx:Tx[];mode:'light'|'dark';onAll:()=>void}){
  return <Paper sx={{...claySx(mode),p:2.2,height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1.4}}>
      <Typography variant="h2">Recent transactions</Typography>
      <Button size="small" endIcon={<ArrowOutwardRoundedIcon/>} onClick={onAll}>View all</Button>
    </Stack>
    <Stack divider={<Box sx={{height:'1px',bgcolor:'divider'}}/>}>
      {tx.map(t=><Stack key={t.id} direction="row" justifyContent="space-between" spacing={1.5} sx={{py:1.35,minWidth:0}}>
        <Box sx={{minWidth:0}}>
          <Typography fontWeight={700} noWrap>{t.merchant||t.description||'Transaction'}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{t.category} · {t.account}</Typography>
          <Stack direction="row" gap={0.6} sx={{mt:.6,flexWrap:'wrap'}}>
            {t.user&&<Chip size="small" label={`${t.user.name} · ${t.user.handle}`} variant="outlined"/>}
            {upiLabel(t)&&<Chip size="small" label={upiLabel(t)} color="primary" variant="outlined"/>}
          </Stack>
        </Box>
        <Box sx={{textAlign:'right',flex:'0 0 auto'}}>
          <Typography fontWeight={800} color={t.direction==='credit'?'primary.main':'text.primary'}>{t.direction==='credit'?'+':'-'}{money(t.amount)}</Typography>
          <Typography variant="caption" color="text.secondary">{t.verification_status.replace('_',' ')}</Typography>
        </Box>
      </Stack>)}
      {!tx.length&&<Typography color="text.secondary" sx={{py:2}}>No transactions in this period.</Typography>}
    </Stack>
  </Paper>
}

export default function Overview(){
  const {period,setPeriodKey}=usePeriod()
  const {familyScope,familyUserId,scopeLabel}=useFamily()
  const {dashboardTemplate,resolvedMode}=useUI()
  const [s,setS]=useState<Summary|null>(null)
  const [tx,setTx]=useState<Tx[]>([])
  const [cash,setCash]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    setLoading(true)
    setError('')
    try{
      const [summary,transactions]=await Promise.all([
        api.summary(period.from,period.to,familyScope,familyUserId),
        api.transactions('',period.from,period.to,familyScope,familyUserId)
      ])
      setS(summary)
      setTx(transactions.slice(0,5))
    }catch(e:any){
      setError(e.message||'Could not load dashboard data.')
      setS(null)
      setTx([])
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[period.from,period.to,familyScope,familyUserId])

  if(loading)return <Box sx={{display:'grid',gap:2}}>
    <Skeleton variant="rounded" height={190} sx={{borderRadius:4}}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>
      <Skeleton variant="rounded" height={260} sx={{borderRadius:4}}/>
      <Skeleton variant="rounded" height={260} sx={{borderRadius:4}}/>
    </Box>
  </Box>

  if(error)return <Alert severity="error" action={<Button onClick={load}>Try again</Button>}>{error}</Alert>
  if(!s)return null

  const pct=s.total?Math.round(s.verified/s.total*1000)/10:0
  const clay=claySx(resolvedMode)

  const hero=<Paper sx={{
    ...clay,
    p:{xs:2.2,sm:3},
    overflow:'hidden',
    position:'relative',
    background:resolvedMode==='dark'
      ? 'radial-gradient(circle at 90% 0%, rgba(120,230,182,.18), transparent 35%), linear-gradient(145deg,#1B2427,#11171C)'
      : 'radial-gradient(circle at 90% 0%, rgba(23,139,101,.16), transparent 36%), linear-gradient(145deg,#FFFFFF,#EAF2EE)',
  }}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">AVAILABLE · {scopeLabel.toUpperCase()}</Typography>
        <Typography sx={{fontSize:'clamp(2.15rem,7vw,4.3rem)',fontWeight:850,letterSpacing:'-.055em',lineHeight:1.05}}>{money(s.available)}</Typography>
        <Typography color="text.secondary" sx={{mt:.8}}>Income − spent for {period.label}</Typography>
      </Box>
      <Button startIcon={<AddRoundedIcon/>} variant="contained" onClick={()=>setCash(true)} sx={{alignSelf:{xs:'stretch',sm:'flex-start'}}}>Add cash expense</Button>
    </Stack>

    <Box sx={{mt:3}}>
      <Stack direction="row" justifyContent="space-between" spacing={2}>
        <Typography variant="body2" fontWeight={700}>{pct}% verified</Typography>
        <Typography variant="caption" color="text.secondary">{s.verified} of {s.total} items</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{mt:.8,height:8,borderRadius:99}}/>
    </Box>
  </Paper>

  const metrics=<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},gap:2}}>
    <MetricCard mode={resolvedMode} label="INCOME" value={money(s.income)} sub="Qualifying inflows" icon={<TrendingUpRoundedIcon/>}/>
    <MetricCard mode={resolvedMode} label="SPENT" value={money(s.spent)} sub="Transfers excluded" icon={<TrendingDownRoundedIcon/>}/>
    <MetricCard mode={resolvedMode} label="LEDGER ITEMS" value={String(s.total)} sub={s.needs_review?`${s.needs_review} need review`:'All clear'} icon={<AccountBalanceWalletRoundedIcon/>}/>
  </Box>

  const cards={
    flow:<CashFlowCard s={s} mode={resolvedMode}/>,
    category:<CategoryCard s={s} mode={resolvedMode}/>,
    family:<FamilyCard s={s} periodLabel={period.label} mode={resolvedMode}/>,
    recent:<RecentCard tx={tx} mode={resolvedMode} onAll={()=>window.location.assign('/transactions')}/>,
  }

  const balanced=<>
    {hero}
    {metrics}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1.15fr .85fr'},gap:2}}>{cards.flow}{cards.family}</Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:2}}>{cards.recent}{cards.category}</Box>
  </>

  const focus=<>
    {hero}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1.35fr .65fr'},gap:2}}>
      {cards.recent}
      <Stack spacing={2}>{metrics}{cards.category}</Stack>
    </Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1.25fr .75fr'},gap:2}}>{cards.flow}{cards.family}</Box>
  </>

  const insights=<>
    {metrics}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1.4fr .6fr'},gap:2}}>{cards.flow}{hero}</Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr 1fr'},gap:2}}>
      {cards.category}
      {cards.family}
      {cards.recent}
    </Box>
  </>

  return <Stack spacing={2.2}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'flex-start',sm:'flex-end'}} spacing={1}>
      <Box>
        <Typography variant="overline" color="text.secondary">{period.label.toUpperCase()} · {scopeLabel.toUpperCase()}</Typography>
        <Typography variant="h1">Dashboard</Typography>
      </Box>
      <Chip label={dashboardTemplate==='balanced'?'Balanced':dashboardTemplate==='focus'?'Focus':'Insights'} variant="outlined"/>
    </Stack>

    {s.total===0&&<Alert
      severity="info"
      action={period.key!=='all'?<Button onClick={()=>setPeriodKey('all')}>Show all dates</Button>:undefined}
    >
      No transactions for {scopeLabel} in {period.label}.
    </Alert>}

    {dashboardTemplate==='focus'?focus:dashboardTemplate==='insights'?insights:balanced}

    <QuickCash open={cash} onClose={()=>setCash(false)} onSaved={load}/>
  </Stack>
}
