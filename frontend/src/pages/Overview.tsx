import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded'
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import QuickCash from '../components/QuickCash'
import PlanningCard from '../components/PlanningCard'
import MonthEndCloseDialog from '../components/MonthEndCloseDialog'
import {api} from '../api/client'
import type {Summary,Tx} from '../types'
import {usePeriod} from '../period'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'
import {getViewCache,setViewCache} from '../viewCache'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

function MetricCard({label,value,sub,icon,mode}:{label:string;value:string;sub:string;icon:React.ReactNode;mode:'light'|'dark'}){
  return <Paper sx={{...claySx(mode),p:{xs:1.35,sm:1.8},minWidth:0}}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
      <Box sx={{minWidth:0}}>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography sx={{fontSize:'clamp(1.35rem,3vw,2rem)',fontWeight:800,letterSpacing:'-.03em',overflowWrap:'anywhere'}}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{sub}</Typography>
      </Box>
      <Box sx={{width:{xs:34,sm:40},height:{xs:34,sm:40},borderRadius:1.75,display:'grid',placeItems:'center',bgcolor:'action.selected',color:'primary.main',flex:'0 0 auto'}}>{icon}</Box>
    </Stack>
  </Paper>
}

function CashFlowCard({s,mode}:{s:Summary;mode:'light'|'dark'}){
  const max=Math.max(1,...s.cashflow.flatMap(x=>[x.income,x.spent]))
  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2},height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:{xs:1.25,sm:2}}}>
      <Box><Typography variant="overline" color="text.secondary">6 MONTHS</Typography><Typography variant="h2">Cash flow</Typography></Box>
      <Stack direction="row" spacing={1}>
        <Chip size="small" label="Opening + income" color="primary" variant="outlined"/>
        <Chip size="small" label="Spent" color="secondary" variant="outlined"/>
      </Stack>
    </Stack>
    {s.cashflow.some((x)=>x.income||x.spent) ? (
      <Box
        sx={{
          height:{xs:165,sm:190},
          display:'grid',
          gridTemplateColumns:`repeat(${s.cashflow.length}, minmax(24px, 1fr))`,
          gap:1,
          alignItems:'end',
        }}
      >
        {s.cashflow.map((m)=>(
          <Stack
            key={m.label}
            alignItems="center"
            spacing={0.7}
            sx={{minWidth:0,height:'100%',justifyContent:'flex-end'}}
          >
            <Stack direction="row" alignItems="flex-end" spacing={0.45} sx={{height:150}}>
              <Box
                title={`Resources ${money(m.income)} · Opening ${money(m.opening_balance)} + New income ${money(m.new_income)}`}
                sx={{
                  width:{xs:7,sm:10},
                  height:`${Math.max(3,m.income/max*145)}px`,
                  borderRadius:'6px 6px 2px 2px',
                  bgcolor:'primary.main',
                }}
              />
              <Box
                title={`Spent ${money(m.spent)}`}
                sx={{
                  width:{xs:7,sm:10},
                  height:`${Math.max(3,m.spent/max*145)}px`,
                  borderRadius:'6px 6px 2px 2px',
                  bgcolor:'secondary.main',
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">{m.label}</Typography>
          </Stack>
        ))}
      </Box>
    ) : (
      <Typography color="text.secondary">
        Cash-flow history will appear after you import or add transactions.
      </Typography>
    )}
  </Paper>
}

function MonthlySpendingCard({s,mode}:{s:Summary;mode:'light'|'dark'}){
  const m=s.monthly_spending
  const comparison=m.previous_month_total<=0
    ? 'No previous-month spending to compare yet'
    : m.change_amount===0
      ? 'Same spending as last month'
      : `${money(Math.abs(m.change_amount))} ${m.change_amount>0?'more':'less'} than last month`
  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2}}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1.2} sx={{mb:1.7}}>
      <Box>
        <Typography variant="overline" color="text.secondary">{m.label.toUpperCase()}</Typography>
        <Typography variant="h2">Monthly spending summary</Typography>
      </Box>
      <Box sx={{textAlign:{xs:'left',sm:'right'}}}>
        <Typography variant="caption" color="text.secondary">TOTAL SPENT</Typography>
        <Typography sx={{fontSize:'clamp(1.45rem,3vw,2.15rem)',fontWeight:850,letterSpacing:'-.03em'}}>{money(m.total)}</Typography>
      </Box>
    </Stack>

    <Box sx={{
      display:'grid',
      gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,minmax(0,1fr))'},
      gap:1,
    }}>
      <Box sx={{p:1.25,borderRadius:2,bgcolor:'action.hover'}}>
        <Typography variant="caption" color="text.secondary">BANK / CASH</Typography>
        <Typography fontWeight={800} sx={{mt:.25}}>{money(m.liquid)}</Typography>
        <Typography variant="caption" color="text.secondary">Reduced available balance</Typography>
      </Box>
      <Box sx={{p:1.25,borderRadius:2,bgcolor:'action.hover'}}>
        <Typography variant="caption" color="text.secondary">CREDIT CARD</Typography>
        <Typography fontWeight={800} sx={{mt:.25}}>{money(m.credit_card)}</Typography>
        <Typography variant="caption" color="text.secondary">Does not reduce cash yet</Typography>
      </Box>
      <Box sx={{p:1.25,borderRadius:2,bgcolor:'action.hover'}}>
        <Typography variant="caption" color="text.secondary">TOP CATEGORY</Typography>
        <Typography fontWeight={800} sx={{mt:.25}}>{m.top_category||'—'}</Typography>
        <Typography variant="caption" color="text.secondary">{m.top_category?money(m.top_category_amount):'No spending yet'}</Typography>
      </Box>
      <Box sx={{p:1.25,borderRadius:2,bgcolor:'action.hover'}}>
        <Typography variant="caption" color="text.secondary">VS LAST MONTH</Typography>
        <Typography fontWeight={800} sx={{mt:.25}}>
          {m.previous_month_total>0&&m.change_percent!=null
            ? `${m.change_amount>0?'+':''}${m.change_percent.toFixed(1)}%`
            : '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary">{comparison}</Typography>
      </Box>
    </Box>

    {s.balance_configured&&<Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={.6} sx={{mt:1.5}}>
      <Typography variant="body2" color="text.secondary">Available now after liquid transactions</Typography>
      <Typography variant="body2" fontWeight={800}>{money(s.available)}</Typography>
    </Stack>}
  </Paper>
}

function CategoryCard({s,mode}:{s:Summary;mode:'light'|'dark'}){
  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2},height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:{xs:1.25,sm:2}}}>
      <Typography variant="h2">Spending by category</Typography>
      <Typography fontWeight={800}>{money(s.spent)}</Typography>
    </Stack>
    <Stack spacing={1.15}>
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
  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2},height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:{xs:1.25,sm:2}}}>
      <Typography variant="h2">Spending by family</Typography>
      <Typography variant="caption" color="text.secondary">{periodLabel}</Typography>
    </Stack>
    <Stack spacing={1.15}>
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
  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2},height:'100%'}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1.4}}>
      <Typography variant="h2">Recent transactions</Typography>
      <Button size="small" endIcon={<ArrowOutwardRoundedIcon/>} onClick={onAll}>View all</Button>
    </Stack>
    <Stack divider={<Box sx={{height:'1px',bgcolor:'divider'}}/>}>
      {tx.map(t=><Stack key={t.id} direction="row" justifyContent="space-between" spacing={1.15} sx={{py:{xs:1,sm:1.25},minWidth:0}}>
        <Box sx={{minWidth:0}}>
          <Typography variant="body2" sx={{fontWeight:700,overflowWrap:'anywhere'}}>{t.merchant||t.description||'Transaction'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.15,overflowWrap:'anywhere'}}>{t.category} · {t.account}</Typography>
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

function AccountingControlCard({mode}:{mode:'light'|'dark'}){
  const accountingCacheKey='overview:accounting'
  const cachedAccounting=getViewCache<{history:any[];closes:any[]}>(accountingCacheKey)
  const [history,setHistory]=useState<any[]>(()=>cachedAccounting?.history||[])
  const [closes,setCloses]=useState<any[]>(()=>cachedAccounting?.closes||[])
  const [closeOpen,setCloseOpen]=useState(false)
  const [loadError,setLoadError]=useState('')

  const now=new Date()
  const previousMonth=new Date(now.getFullYear(),now.getMonth()-1,1)
  const targetKey=`${previousMonth.getFullYear()}-${String(previousMonth.getMonth()+1).padStart(2,'0')}`
  const targetLabel=previousMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'})
  const alreadyClosed=closes.some((row:any)=>row.month_key===targetKey)

  async function loadAccounting(force=false){
    if(!force){
      const cached=getViewCache<{history:any[];closes:any[]}>(accountingCacheKey)
      if(cached){
        setHistory(cached.history)
        setCloses(cached.closes)
        setLoadError('')
        return
      }
    }

    setLoadError('')
    try{
      const [historyResult,closeResult]=await Promise.all([
        api.balanceHistory(5),
        api.monthlyCloses(),
      ])
      const next={
        history:historyResult?.items||[],
        closes:closeResult?.items||[],
      }
      setHistory(next.history)
      setCloses(next.closes)
      setViewCache(accountingCacheKey,next)
    }catch(e:any){
      setLoadError(e.message||'Could not load accounting history.')
    }
  }

  useEffect(()=>{loadAccounting()},[])

  const latestClose=closes[0]

  return <Paper sx={{...claySx(mode),p:{xs:1.4,sm:2}}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" spacing={2}>
      <Box sx={{flex:1,minWidth:0}}>
        <Typography variant="overline" color="text.secondary">ACCOUNTING CONTROL</Typography>
        <Typography variant="h2">Month close & balance history</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.45}}>
          Use the guided close to review records, enter the actual month-end bank and cash balances, preview the month, and then lock the reporting snapshot.
        </Typography>

        <Stack spacing={.75} sx={{mt:1.5}}>
          {history.slice(0,3).map((row:any)=><Stack key={row.id} direction="row" justifyContent="space-between" spacing={1}>
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" color="text.secondary">
                {new Date(row.as_of).toLocaleString('en-IN')}
              </Typography>
              {row.source==='month_end'&&<Typography variant="caption" color="primary.main">Month-end balance</Typography>}
            </Box>
            <Typography variant="body2" fontWeight={800}>{money(row.total)}</Typography>
          </Stack>)}
          {!history.length&&!loadError&&<Typography variant="body2" color="text.secondary">
            No balance history yet. The month-end guide will create the historical closing balance for you.
          </Typography>}
          {loadError&&<Typography variant="caption" color="error.main">{loadError}</Typography>}
        </Stack>
      </Box>

      <Box sx={{minWidth:{md:300}}}>
        {latestClose?<Paper variant="outlined" sx={{p:1.25,borderRadius:2,mb:1}}>
          <Typography variant="caption" color="text.secondary">LATEST CLOSED MONTH</Typography>
          <Typography fontWeight={850} sx={{mt:.25}}>{latestClose.month_key} · {money(latestClose.closing_balance)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Savings {money(latestClose.savings)}
          </Typography>
        </Paper>:<Paper variant="outlined" sx={{p:1.25,borderRadius:2,mb:1}}>
          <Typography variant="caption" color="text.secondary">MONTH-END GUIDE</Typography>
          <Typography variant="body2" fontWeight={800} sx={{mt:.25}}>Nothing closed yet</Typography>
          <Typography variant="caption" color="text.secondary">
            The guide will tell you exactly what to review and where to enter closing balances.
          </Typography>
        </Paper>}

        <Button
          fullWidth
          variant={alreadyClosed?'outlined':'contained'}
          onClick={()=>setCloseOpen(true)}
        >
          {alreadyClosed?`View ${targetLabel} close`:`Prepare & close ${targetLabel}`}
        </Button>
        {!alreadyClosed&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.75}}>
          Review records → enter month-end balance → preview → close
        </Typography>}
      </Box>
    </Stack>

    <MonthEndCloseDialog
      open={closeOpen}
      monthKey={targetKey}
      monthLabel={targetLabel}
      onClose={()=>setCloseOpen(false)}
      onClosed={()=>loadAccounting(true)}
    />
  </Paper>
}

function BalanceDialog({
  open,
  onClose,
  onSaved,
  summary,
}:{
  open:boolean
  onClose:()=>void
  onSaved:()=>void|Promise<void>
  summary:Summary
}){
  const [bank,setBank]=useState('')
  const [cash,setCash]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    if(!open)return
    setBank(summary.bank_balance==null?'':String(Math.max(0,summary.bank_balance)))
    setCash(summary.cash_balance==null?'':String(Math.max(0,summary.cash_balance)))
    setError('')
  },[open,summary.bank_balance,summary.cash_balance])

  async function save(){
    setSaving(true)
    setError('')
    try{
      await api.updateBalance({
        bank_balance:Number(bank||0),
        cash_balance:Number(cash||0),
      })
      await onSaved()
      onClose()
    }catch(e:any){
      setError(e.message||'Could not update available balance.')
    }finally{
      setSaving(false)
    }
  }

  return <Dialog open={open} onClose={saving?undefined:onClose} fullWidth maxWidth="xs">
    <DialogTitle>Set current balance</DialogTitle>
    <DialogContent>
      <Stack spacing={1.5} sx={{pt:.6}}>
        <Typography variant="body2" color="text.secondary">
          Enter what you have right now. Transactions recorded after this balance point will automatically adjust it.
        </Typography>
        <TextField
          label="Money in bank"
          type="number"
          value={bank}
          inputProps={{min:0,step:.01,inputMode:'decimal'}}
          onChange={e=>setBank(e.target.value)}
        />
        <TextField
          label="Cash in hand"
          type="number"
          value={cash}
          inputProps={{min:0,step:.01,inputMode:'decimal'}}
          onChange={e=>setCash(e.target.value)}
        />
        <Alert severity="info">
          Cash, UPI and investment payments reduce liquid balance. Credit-card purchases do not reduce bank or cash balance.
        </Alert>
        {error&&<Alert severity="error">{error}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{p:2}}>
      <Button onClick={onClose} disabled={saving}>Cancel</Button>
      <Button variant="contained" onClick={save} disabled={saving||Number(bank||0)<0||Number(cash||0)<0}>
        {saving?'Saving…':'Save balance'}
      </Button>
    </DialogActions>
  </Dialog>
}

export default function Overview(){
  const {period,setPeriodKey}=usePeriod()
  const {familyScope,familyUserId,scopeLabel}=useFamily()
  const {dashboardTemplate,resolvedMode}=useUI()
  const [s,setS]=useState<Summary|null>(null)
  const [tx,setTx]=useState<Tx[]>([])
  const [cash,setCash]=useState(false)
  const [balanceOpen,setBalanceOpen]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    setLoading(true)
    setError('')
    try{
      const [summary,transactions]=await Promise.all([
        api.summary(period.from,period.to,familyScope,familyUserId),
        api.transactions({
          from:period.from,
          to:period.to,
          familyScope,
          familyUserId,
          page:1,
          pageSize:5,
        })
      ])
      setS(summary)
      setTx(transactions.items||[])
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
    <Skeleton variant="rounded" height={160} sx={{borderRadius:1.75}}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>
      <Skeleton variant="rounded" height={220} sx={{borderRadius:1.75}}/>
      <Skeleton variant="rounded" height={220} sx={{borderRadius:1.75}}/>
    </Box>
  </Box>

  if(error)return <Alert severity="error" action={<Button onClick={load}>Try again</Button>}>{error}</Alert>
  if(!s)return null

  const pct=s.total?Math.round(s.verified/s.total*1000)/10:0
  const clay=claySx(resolvedMode)

  const hero=<Paper sx={{
    ...clay,
    p:{xs:1.5,sm:2.4},
    overflow:'hidden',
    position:'relative',
    background:resolvedMode==='dark'
      ? 'radial-gradient(circle at 90% 0%, rgba(120,230,182,.18), transparent 35%), linear-gradient(145deg,#1B2427,#11171C)'
      : 'radial-gradient(circle at 90% 0%, rgba(23,139,101,.16), transparent 36%), linear-gradient(145deg,#FFFFFF,#EAF2EE)',
  }}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">AVAILABLE BALANCE · {scopeLabel.toUpperCase()}</Typography>
        <Typography sx={{fontSize:'clamp(1.95rem,9vw,4rem)',fontWeight:850,letterSpacing:'-.055em',lineHeight:1.05}}>{money(s.available)}</Typography>
        {s.balance_configured
          ? <Typography color="text.secondary" sx={{mt:.8}}>
              Bank {money(s.bank_balance||0)} · Cash in hand {money(s.cash_balance||0)}
            </Typography>
          : <Typography color="text.secondary" sx={{mt:.8}}>
              Set your current bank balance and cash in hand to start tracking what is actually available.
            </Typography>}
      </Box>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{alignSelf:{xs:'stretch',sm:'flex-start'}}}>
        {familyScope==='self'&&!familyUserId&&<Button variant="outlined" onClick={()=>setBalanceOpen(true)}>
          {s.balance_configured?'Update balance':'Set balance'}
        </Button>}
        <Button startIcon={<AddRoundedIcon/>} variant="contained" onClick={()=>setCash(true)}>Add transaction</Button>
      </Stack>
    </Stack>

    <Box sx={{mt:{xs:2,sm:3}}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}>
        <Box>
          <Typography variant="body2" fontWeight={700}>{pct}% verified</Typography>
          <Typography variant="caption" color="text.secondary">{s.verified} of {s.total} items verified</Typography>
        </Box>
        {s.needs_review>0&&familyScope==='self'&&!familyUserId&&<Button
          size="small"
          variant="outlined"
          onClick={()=>window.location.assign('/#/transactions?status=review')}
        >
          Review {s.needs_review} transaction{s.needs_review===1?'':'s'}
        </Button>}
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{mt:.8,height:8,borderRadius:99}}/>
    </Box>
  </Paper>

  const metrics=<Box sx={{
    display:'grid',
    gridTemplateColumns:{xs:'1fr',sm:'repeat(2,1fr)',md:'repeat(3,1fr)',xl:'repeat(5,minmax(0,1fr))'},
    gap:{xs:1.15,sm:2},
  }}>
    <MetricCard
      mode={resolvedMode}
      label="INCOME RESOURCES"
      value={money(s.income)}
      sub={`Opening ${money(s.opening_balance)} + new income ${money(s.new_income)}`}
      icon={<TrendingUpRoundedIcon/>}
    />
    <MetricCard
      mode={resolvedMode}
      label="SPENT"
      value={money(s.spent)}
      sub="Transfers and investments excluded"
      icon={<TrendingDownRoundedIcon/>}
    />
    <MetricCard
      mode={resolvedMode}
      label="OUTSTANDING DEBT"
      value={money(s.debt_outstanding)}
      sub={s.debt_count?`${s.debt_count} open debt${s.debt_count===1?'':'s'} · current snapshot`:'No open debt'}
      icon={<CreditCardRoundedIcon/>}
    />
    <MetricCard
      mode={resolvedMode}
      label="EST. NET WORTH"
      value={money(s.net_worth)}
      sub={`Cash ${money(s.liquid_balance)} + investments ${money(s.investment_value)} − debt`}
      icon={<SavingsRoundedIcon/>}
    />
    <MetricCard
      mode={resolvedMode}
      label="LEDGER ITEMS"
      value={String(s.total)}
      sub={s.needs_review?`${s.needs_review} need review`:'All clear'}
      icon={<AccountBalanceWalletRoundedIcon/>}
    />
  </Box>

  const cards={
    spending:<MonthlySpendingCard s={s} mode={resolvedMode}/>,
    planning:familyScope==='self'&&!familyUserId?<PlanningCard mode={resolvedMode} refreshKey={String(s.total)+':'+String(s.available)+':'+String(s.spent)} onChanged={load}/>:null,
    accounting:<AccountingControlCard mode={resolvedMode}/>,
    flow:<CashFlowCard s={s} mode={resolvedMode}/>,
    category:<CategoryCard s={s} mode={resolvedMode}/>,
    family:<FamilyCard s={s} periodLabel={period.label} mode={resolvedMode}/>,
    recent:<RecentCard tx={tx} mode={resolvedMode} onAll={()=>window.location.assign('/#/transactions')}/>,
  }

  const balanced=<>
    {hero}
    {metrics}
    {cards.spending}
    {cards.planning}
    {cards.accounting}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1.15fr .85fr'},gap:{xs:1.15,sm:2}}}>{cards.flow}{cards.family}</Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:{xs:1.15,sm:2}}}>{cards.recent}{cards.category}</Box>
  </>

  const focus=<>
    {hero}
    {metrics}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1.35fr .65fr'},gap:{xs:1.15,sm:2}}}>
      {cards.recent}
      {cards.category}
    </Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1.25fr .75fr'},gap:{xs:1.15,sm:2}}}>{cards.flow}{cards.family}</Box>
  </>

  const insights=<>
    {metrics}
    {cards.spending}
    {cards.planning}
    {cards.accounting}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1.4fr .6fr'},gap:{xs:1.15,sm:2}}}>{cards.flow}{hero}</Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr 1fr'},gap:{xs:1.15,sm:2}}}>
      {cards.category}
      {cards.family}
      {cards.recent}
    </Box>
  </>

  return <Stack spacing={{xs:1.4,sm:2}}>
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
    <BalanceDialog open={balanceOpen} onClose={()=>setBalanceOpen(false)} onSaved={load} summary={s}/>
  </Stack>
}
