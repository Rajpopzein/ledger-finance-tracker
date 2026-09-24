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
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded'
import {api} from '../api/client'
import {useAppData} from '../appData'
import {claySx} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',
  currency:'INR',
  maximumFractionDigits:0,
}).format(n)

const nextMonthDate=()=>{
  const d=new Date()
  d.setMonth(d.getMonth()+1)
  return d.toISOString().slice(0,10)
}

export default function PlanningCard({mode,refreshKey}:{mode:'light'|'dark';refreshKey?:string}){
  const {categories}=useAppData()
  const clay=claySx(mode)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [budgetOpen,setBudgetOpen]=useState(false)
  const [commitmentOpen,setCommitmentOpen]=useState(false)
  const [budgetForm,setBudgetForm]=useState({category:'Groceries',monthly_limit:''})
  const [commitmentForm,setCommitmentForm]=useState({
    title:'',
    amount:'',
    next_due_date:nextMonthDate(),
    recurrence:'monthly',
    category:'Bills & Subscriptions',
    notes:'',
  })
  const [busy,setBusy]=useState('')

  const categoryNames=useMemo(()=>{
    const names=categories.map((item:any)=>item.name)
    return Array.from(new Set(['Groceries','Food & Dining','Fuel','Shopping','Bills & Subscriptions','Travel','Health','EMI & Loans',...names]))
  },[categories])

  async function load(){
    setLoading(true)
    setError('')
    try{
      setData(await api.planningSummary())
    }catch(e:any){
      setData(null)
      setError(e.message||'Could not load planning data.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[refreshKey])

  async function saveBudget(){
    if(!budgetForm.category||!Number(budgetForm.monthly_limit))return
    setBusy('budget');setError('');setNotice('')
    try{
      await api.saveBudget({
        category:budgetForm.category,
        monthly_limit:Number(budgetForm.monthly_limit),
        is_active:true,
      })
      setBudgetOpen(false)
      setBudgetForm(current=>({...current,monthly_limit:''}))
      setNotice('Budget saved.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not save budget.')
    }finally{
      setBusy('')
    }
  }

  async function removeBudget(id:number){
    if(!window.confirm('Delete this category budget?'))return
    setBusy('budget-delete:'+id);setError('');setNotice('')
    try{
      await api.deleteBudget(id)
      setNotice('Budget deleted.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not delete budget.')
    }finally{
      setBusy('')
    }
  }

  async function saveCommitment(){
    if(!commitmentForm.title.trim()||!Number(commitmentForm.amount)||!commitmentForm.next_due_date)return
    setBusy('commitment');setError('');setNotice('')
    try{
      await api.createCommitment({
        title:commitmentForm.title.trim(),
        amount:Number(commitmentForm.amount),
        next_due_date:new Date(commitmentForm.next_due_date+'T09:00:00').toISOString(),
        recurrence:commitmentForm.recurrence,
        category:commitmentForm.category||null,
        notes:commitmentForm.notes.trim()||null,
        is_active:true,
      })
      setCommitmentOpen(false)
      setCommitmentForm({
        title:'',
        amount:'',
        next_due_date:nextMonthDate(),
        recurrence:'monthly',
        category:'Bills & Subscriptions',
        notes:'',
      })
      setNotice('Upcoming commitment added.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not add commitment.')
    }finally{
      setBusy('')
    }
  }

  async function completeCommitment(id:number){
    setBusy('commitment-complete:'+id);setError('');setNotice('')
    try{
      await api.completeCommitment(id)
      setNotice('Commitment marked paid.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not complete commitment.')
    }finally{
      setBusy('')
    }
  }

  async function removeCommitment(id:number){
    if(!window.confirm('Delete this commitment?'))return
    setBusy('commitment-delete:'+id);setError('');setNotice('')
    try{
      await api.deleteCommitment(id)
      setNotice('Commitment deleted.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not delete commitment.')
    }finally{
      setBusy('')
    }
  }

  if(loading)return <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
    <Typography variant="h2">Planning</Typography>
    <Typography color="text.secondary" sx={{mt:.5}}>Calculating budgets and upcoming commitments…</Typography>
  </Paper>

  return <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
    <Stack spacing={1.5}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'stretch',sm:'center'}} spacing={1.2}>
        <Box>
          <Typography variant="overline" color="text.secondary">PLANNING · NEXT 30 DAYS</Typography>
          <Typography variant="h2">Plan what stays available</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{flexWrap:'wrap'}}>
          <Button variant="outlined" onClick={()=>setBudgetOpen(true)}>Add / update budget</Button>
          <Button variant="contained" onClick={()=>setCommitmentOpen(true)}>Add commitment</Button>
        </Stack>
      </Stack>

      {!data?.balance_configured&&<Alert severity="info">
        Set your current balance to make Safe to Spend meaningful.
      </Alert>}
      {error&&<Alert severity="error">{error}</Alert>}
      {notice&&<Alert severity="success">{notice}</Alert>}

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,.8fr) minmax(0,1.2fr)'},gap:1.5,alignItems:'stretch'}}>
        <Paper variant="outlined" sx={{p:{xs:1.35,sm:1.6},borderRadius:2.5,height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <Box>
            <Typography variant="overline" color="text.secondary">SAFE TO SPEND</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{mt:.35}}>
              <SavingsRoundedIcon color="primary"/>
              <Typography sx={{fontSize:'clamp(1.7rem,4vw,2.5rem)',fontWeight:850,letterSpacing:'-.035em'}}>
                {money(data?.safe_to_spend||0)}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
              What remains after commitments due in the next 30 days.
            </Typography>
          </Box>
          <Box sx={{display:'grid',gridTemplateColumns:'1fr auto',columnGap:2,rowGap:.65,mt:2,pt:1.4,borderTop:'1px solid',borderColor:'divider'}}>
            <Typography variant="body2" color="text.secondary">Available balance</Typography>
            <Typography variant="body2" fontWeight={800}>{money(data?.available_balance||0)}</Typography>
            <Typography variant="body2" color="text.secondary">Upcoming commitments</Typography>
            <Typography variant="body2" fontWeight={800}>− {money(data?.committed_next_30_days||0)}</Typography>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{p:{xs:1.35,sm:1.6},borderRadius:2.5,height:'100%',minWidth:0}}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{mb:1.15}}>
            <Box>
              <Typography variant="overline" color="text.secondary">NEXT 30 DAYS</Typography>
              <Typography fontWeight={850}>Upcoming commitments</Typography>
            </Box>
            <Chip size="small" variant="outlined" label={money(data?.committed_next_30_days||0)}/>
          </Stack>
          <Stack spacing={.75}>
            {(data?.upcoming||[]).slice(0,7).map((item:any)=><Box key={String(item.id)} sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(0,1fr) 110px 110px auto'},gap:{xs:.6,sm:1},alignItems:'center',py:.8,borderTop:'1px solid',borderColor:'divider','&:first-of-type':{borderTop:0,pt:0}}}>
              <Box sx={{minWidth:0}}>
                <Typography variant="body2" fontWeight={800} noWrap>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{display:{xs:'block',sm:'none'}}}>
                  {new Date(item.next_due_date).toLocaleDateString('en-IN')} · {item.source==='manual'?item.recurrence:item.source==='ai_predicted'?'AI predicted':item.source==='recurring'?'Recurring':item.source}
                  {item.confidence?` · ${Math.round(item.confidence*100)}%`:''}
                </Typography>
              </Box>
              <Box sx={{display:{xs:'none',sm:'block'}}}>
                <Typography variant="caption" color={item.overdue?'warning.main':'text.secondary'} sx={{display:'block'}}>
                  {new Date(item.next_due_date).toLocaleDateString('en-IN')}
                </Typography>
                {(item.source==='recurring'||item.source==='ai_predicted')&&<Typography variant="caption" color="text.secondary">
                  {item.source==='recurring'?'Recurring':'AI predicted'}{item.confidence?` · ${Math.round(item.confidence*100)}%`:''}
                </Typography>}
              </Box>
              <Typography variant="body2" fontWeight={850} textAlign="right">{money(item.amount)}</Typography>
              <Stack direction="row" spacing={.25} justifyContent="flex-end" sx={{gridColumn:{xs:'1 / -1',sm:'auto'}}}>
                {item.source==='manual'&&<Button size="small" variant="outlined" disabled={busy==='commitment-complete:'+item.id} onClick={()=>completeCommitment(Number(item.id))}>Paid</Button>}
                {item.source==='manual'&&<Button size="small" color="error" disabled={busy==='commitment-delete:'+item.id} onClick={()=>removeCommitment(Number(item.id))}><DeleteOutlineRoundedIcon fontSize="small"/></Button>}
              </Stack>
            </Box>)}
            {!(data?.upcoming||[]).length&&<Typography variant="body2" color="text.secondary">Nothing committed in the next 30 days.</Typography>}
          </Stack>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{p:{xs:1.35,sm:1.6},borderRadius:2.5}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'flex-start',sm:'center'}} spacing={.8} sx={{mb:1.15}}>
          <Box>
            <Typography variant="overline" color="text.secondary">MONTHLY BUDGETS</Typography>
            <Typography fontWeight={850}>{data?.budget_month}</Typography>
          </Box>
          <Chip size="small" variant="outlined" label={money(data?.budget_spent||0)+' / '+money(data?.budget_limit||0)}/>
        </Stack>
        <Stack spacing={.25}>
          {(data?.budgets||[]).slice(0,8).map((budget:any)=><Box key={budget.id} sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(130px,.7fr) minmax(180px,1.3fr) 180px 42px'},gap:{xs:.7,sm:1.25},alignItems:'center',py:1,borderTop:'1px solid',borderColor:'divider','&:first-of-type':{borderTop:0,pt:0}}}>
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" fontWeight={800} noWrap>{budget.category}</Typography>
              <Typography variant="caption" color={budget.over_by>0?'warning.main':'text.secondary'}>{budget.over_by>0?money(budget.over_by)+' over':money(budget.remaining)+' remaining'}</Typography>
            </Box>
            <Box sx={{gridColumn:{xs:'1 / -1',sm:'auto'},order:{xs:3,sm:'initial'}}}>
              <LinearProgress variant="determinate" value={Math.min(100,budget.percent||0)} color={budget.percent>100?'warning':'primary'} sx={{height:8,borderRadius:99}}/>
            </Box>
            <Typography variant="body2" color="text.secondary" textAlign={{xs:'right',sm:'right'}}>{money(budget.spent)} / {money(budget.monthly_limit)}</Typography>
            <Button size="small" color="error" disabled={busy==='budget-delete:'+budget.id} onClick={()=>removeBudget(budget.id)} sx={{minWidth:36,justifySelf:'end'}}><DeleteOutlineRoundedIcon fontSize="small"/></Button>
          </Box>)}
          {!(data?.budgets||[]).length&&<Typography variant="body2" color="text.secondary">No category budgets yet.</Typography>}
        </Stack>
      </Paper>
    </Stack>

    <Dialog open={budgetOpen} onClose={busy==='budget'?undefined:()=>setBudgetOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Add or update category budget</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{pt:.5}}>
          <FormControl size="small">
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={budgetForm.category}
              onChange={e=>setBudgetForm({...budgetForm,category:String(e.target.value)})}
            >
              {categoryNames.map(name=><MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            autoFocus
            label="Monthly limit"
            type="number"
            value={budgetForm.monthly_limit}
            onChange={e=>setBudgetForm({...budgetForm,monthly_limit:e.target.value})}
            inputProps={{min:0,step:.01,inputMode:'decimal'}}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{p:2}}>
        <Button onClick={()=>setBudgetOpen(false)} disabled={busy==='budget'}>Cancel</Button>
        <Button variant="contained" onClick={saveBudget} disabled={busy==='budget'||!Number(budgetForm.monthly_limit)}>
          {busy==='budget'?'Saving…':'Save budget'}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={commitmentOpen} onClose={busy==='commitment'?undefined:()=>setCommitmentOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Add upcoming commitment</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{pt:.5}}>
          <TextField
            autoFocus
            label="Name"
            placeholder="Rent, Netflix, insurance…"
            value={commitmentForm.title}
            onChange={e=>setCommitmentForm({...commitmentForm,title:e.target.value})}
          />
          <TextField
            label="Amount"
            type="number"
            value={commitmentForm.amount}
            onChange={e=>setCommitmentForm({...commitmentForm,amount:e.target.value})}
            inputProps={{min:0,step:.01,inputMode:'decimal'}}
          />
          <TextField
            label="Next due date"
            type="date"
            InputLabelProps={{shrink:true}}
            value={commitmentForm.next_due_date}
            onChange={e=>setCommitmentForm({...commitmentForm,next_due_date:e.target.value})}
          />
          <FormControl size="small">
            <InputLabel>Repeats</InputLabel>
            <Select
              label="Repeats"
              value={commitmentForm.recurrence}
              onChange={e=>setCommitmentForm({...commitmentForm,recurrence:String(e.target.value)})}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="one_time">One time</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={commitmentForm.category}
              onChange={e=>setCommitmentForm({...commitmentForm,category:String(e.target.value)})}
            >
              {categoryNames.map(name=><MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            label="Notes"
            value={commitmentForm.notes}
            onChange={e=>setCommitmentForm({...commitmentForm,notes:e.target.value})}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{p:2}}>
        <Button onClick={()=>setCommitmentOpen(false)} disabled={busy==='commitment'}>Cancel</Button>
        <Button
          variant="contained"
          onClick={saveCommitment}
          disabled={busy==='commitment'||!commitmentForm.title.trim()||!Number(commitmentForm.amount)||!commitmentForm.next_due_date}
        >
          {busy==='commitment'?'Saving…':'Add commitment'}
        </Button>
      </DialogActions>
    </Dialog>
  </Paper>
}
