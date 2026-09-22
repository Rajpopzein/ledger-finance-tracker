import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import type {TransactionPage,Tx} from '../types'
import {api} from '../api/client'
import {usePeriod} from '../period'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

export default function Transactions(){
  const {period}=usePeriod()
  const {familyScope,familyUserId,scopeLabel}=useFamily()
  const {resolvedMode}=useUI()

  const [q,setQ]=useState('')
  const [fromDate,setFromDate]=useState(period.from||'')
  const [toDate,setToDate]=useState(period.to||'')
  const [accountId,setAccountId]=useState('')
  const [direction,setDirection]=useState('')
  const [accounts,setAccounts]=useState<any[]>([])
  const [data,setData]=useState<TransactionPage>({items:[],page:1,page_size:25,total:0,pages:1})
  const [selected,setSelected]=useState<Tx|null>(null)
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(25)
  const [loading,setLoading]=useState(true)
  const [aiBusy,setAiBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')

  const canCategorize=familyScope==='self'&&!familyUserId

  useEffect(()=>{
    setFromDate(period.from||'')
    setToDate(period.to||'')
    setPage(1)
  },[period.from,period.to])

  useEffect(()=>{
    api.accounts().then(setAccounts).catch(()=>setAccounts([]))
  },[])

  async function load(){
    setLoading(true)
    setError('')
    try{
      const result=await api.transactions({
        q,
        from:fromDate||undefined,
        to:toDate||undefined,
        familyScope,
        familyUserId,
        accountId:accountId?Number(accountId):undefined,
        direction:direction==='credit'||direction==='debit'?direction:undefined,
        page,
        pageSize,
      })
      setData(result)
      setSelected(prev=>result.items.find((x:Tx)=>x.id===prev?.id)||result.items[0]||null)
      if(page>result.pages)setPage(result.pages)
    }catch(e:any){
      setData({items:[],page:1,page_size:pageSize,total:0,pages:1})
      setSelected(null)
      setError(e.message||'Could not load transactions.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    const timer=setTimeout(load,220)
    return()=>clearTimeout(timer)
  },[q,fromDate,toDate,accountId,direction,page,pageSize,familyScope,familyUserId])

  async function categorizePage(){
    const ids=data.items.map(x=>x.id)
    if(!ids.length)return
    setAiBusy(true);setNotice('');setError('')
    try{
      const result=await api.aiCategorize(ids)
      setNotice(`AI categorized ${result.applied} of ${result.requested} transactions on this page.`)
      await load()
    }catch(e:any){
      setError(e.message||'Could not categorize these transactions.')
    }finally{
      setAiBusy(false)
    }
  }

  async function undoCategory(tx:Tx){
    setAiBusy(true);setNotice('');setError('')
    try{
      await api.undoCategory(tx.id)
      setNotice('AI category change undone.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not undo this category.')
    }finally{
      setAiBusy(false)
    }
  }

  const clay=claySx(resolvedMode)
  const bankAccounts=accounts.filter(a=>a.type==='bank')

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">{scopeLabel.toUpperCase()}</Typography>
      <Typography variant="h1">Transactions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        {data.total.toLocaleString('en-IN')} transactions match the current filters.
      </Typography>
    </Box>

    <Paper sx={{...clay,p:{xs:1.15,sm:1.5}}}>
      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'minmax(220px,1.4fr) repeat(2,minmax(140px,.7fr))',lg:'minmax(220px,1.4fr) 190px 150px 150px 140px'},
        gap:1,
        alignItems:'start',
      }}>
        <TextField
          value={q}
          onChange={e=>{setQ(e.target.value);setPage(1)}}
          placeholder="Search merchant or description"
          InputProps={{startAdornment:<SearchRoundedIcon sx={{mr:1,color:'text.secondary'}}/>}}
        />

        <FormControl size="small">
          <InputLabel>Bank</InputLabel>
          <Select label="Bank" value={accountId} onChange={e=>{setAccountId(String(e.target.value));setPage(1)}}>
            <MenuItem value="">All banks</MenuItem>
            {bankAccounts.map(a=><MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          type="date"
          label="From"
          InputLabelProps={{shrink:true}}
          value={fromDate}
          onChange={e=>{setFromDate(e.target.value);setPage(1)}}
        />

        <TextField
          type="date"
          label="To"
          InputLabelProps={{shrink:true}}
          value={toDate}
          onChange={e=>{setToDate(e.target.value);setPage(1)}}
        />

        <FormControl size="small">
          <InputLabel>Flow</InputLabel>
          <Select label="Flow" value={direction} onChange={e=>{setDirection(String(e.target.value));setPage(1)}}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="debit">Outgoing</MenuItem>
            <MenuItem value="credit">Incoming</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" alignItems={{sm:'center'}} sx={{mt:1}}>
        <Typography variant="caption" color="text.secondary">
          Incoming credits are included in Income. Account numbers and IFSC codes are not shown here or sent to AI.
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AutoAwesomeRoundedIcon/>}
          onClick={categorizePage}
          disabled={!canCategorize||aiBusy||!data.items.length}
        >
          {aiBusy?'Categorizing…':'AI categorize page'}
        </Button>
      </Stack>
      {!canCategorize&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.6}}>
        AI categorization is available only in your Self view because family transactions belong to other users.
      </Typography>}
    </Paper>

    {notice&&<Alert severity="success">{notice}</Alert>}
    {error&&<Alert severity="error">{error}</Alert>}

    {loading?<Stack spacing={1}>
      {[1,2,3,4].map(i=><Skeleton key={i} variant="rounded" height={72} sx={{borderRadius:1.5}}/>)}
    </Stack>:<Box sx={{
      display:'grid',
      gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 360px'},
      gap:{xs:1.15,sm:2},
      alignItems:'start',
    }}>
      <Paper sx={{...clay,p:{xs:.5,sm:1.15},minWidth:0}}>
        <Stack divider={<Divider/>}>
          {data.items.map(t=><Box
            key={t.id}
            component="button"
            onClick={()=>setSelected(t)}
            sx={{
              border:0,
              width:'100%',
              bgcolor:selected?.id===t.id?'action.selected':'transparent',
              color:'text.primary',
              textAlign:'left',
              cursor:'pointer',
              borderRadius:1.4,
              p:{xs:1,sm:1.25},
              display:'grid',
              gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(0,2fr) minmax(110px,1fr) minmax(100px,.8fr) auto'},
              gap:{xs:.6,sm:1.15},
              alignItems:'center',
              '&:hover':{bgcolor:'action.hover'},
            }}
          >
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" sx={{fontWeight:750,overflowWrap:'anywhere'}}>{t.merchant||'Transaction'}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{display:'block',overflowWrap:'anywhere'}}>
                {t.category} · {t.txn_type.replace('_',' ')}
              </Typography>
              <Stack direction="row" gap={0.5} sx={{mt:.5,flexWrap:'wrap'}}>
                {t.category_source==='ai'&&<Chip size="small" color="secondary" variant="outlined" label="AI categorized"/>}
                {upiLabel(t)&&<Chip size="small" color="primary" variant="outlined" label={upiLabel(t)}/>}
              </Stack>
            </Box>

            <Box sx={{display:{xs:'none',sm:'block'},minWidth:0}}>
              <Typography variant="body2" noWrap>{t.account}</Typography>
              <Typography variant="caption" color="text.secondary">{t.payment_method||'—'}</Typography>
            </Box>

            <Box sx={{display:{xs:'none',sm:'block'}}}>
              <Typography variant="body2">{new Date(t.txn_at).toLocaleDateString('en-IN')}</Typography>
              <Typography variant="caption" color="text.secondary">{t.verification_status.replace('_',' ')}</Typography>
            </Box>

            <Box sx={{textAlign:'right',alignSelf:'start'}}>
              <Typography sx={{fontWeight:800,fontSize:{xs:13,sm:14}}} color={t.direction==='credit'?'primary.main':'text.primary'}>
                {t.direction==='credit'?'+':'-'}{money(t.amount)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{display:{xs:'block',sm:'none'}}}>
                {new Date(t.txn_at).toLocaleDateString('en-IN')}
              </Typography>
            </Box>
          </Box>)}

          {!data.items.length&&<Box sx={{p:3,textAlign:'center'}}>
            <Typography sx={{fontWeight:700}}>No transactions match these filters.</Typography>
          </Box>}
        </Stack>

        {data.total>0&&<Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" alignItems="center" sx={{pt:1.25}}>
          <Pagination
            count={data.pages}
            page={data.page}
            onChange={(_,value)=>setPage(value)}
            size="small"
            siblingCount={0}
            boundaryCount={1}
          />
          <FormControl size="small" sx={{minWidth:105}}>
            <InputLabel>Per page</InputLabel>
            <Select label="Per page" value={String(pageSize)} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>
              {[10,25,50,100].map(size=><MenuItem key={size} value={String(size)}>{size}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>}
      </Paper>

      {selected&&<Paper sx={{...clay,p:{xs:1.4,sm:2},minWidth:0,position:{lg:'sticky'},top:{lg:92}}}>
        <Typography variant="overline" color="text.secondary">TRANSACTION DETAILS</Typography>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} sx={{mt:.5}}>
          <Box sx={{minWidth:0}}>
            <Typography variant="h2" sx={{overflowWrap:'anywhere'}}>{selected.merchant||'Transaction'}</Typography>
            <Typography variant="caption" color="text.secondary">{new Date(selected.txn_at).toLocaleString('en-IN')}</Typography>
          </Box>
          <Typography sx={{fontWeight:850,fontSize:'1.2rem',flex:'0 0 auto'}}>{money(selected.amount)}</Typography>
        </Stack>

        <Divider sx={{my:1.5}}/>

        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1}}>
          <Box><Typography variant="caption" color="text.secondary">Category</Typography><Typography variant="body2" sx={{fontWeight:700}}>{selected.category}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Bank / account</Typography><Typography variant="body2" sx={{fontWeight:700,overflowWrap:'anywhere'}}>{selected.account}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">User</Typography><Typography variant="body2" sx={{fontWeight:700}}>{selected.user?.name||'Unknown'}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Status</Typography><Typography variant="body2" sx={{fontWeight:700}}>{selected.verification_status.replace('_',' ')}</Typography></Box>
        </Box>

        {selected.category_source==='ai'&&<Alert severity="info" sx={{mt:1.5}}>
          This category was selected by AI.
        </Alert>}

        {selected.can_undo_category&&<Button
          fullWidth
          sx={{mt:1}}
          startIcon={<UndoRoundedIcon/>}
          onClick={()=>undoCategory(selected)}
          disabled={aiBusy}
        >
          Undo AI category
        </Button>}

        <Divider sx={{my:1.5}}/>
        <Typography variant="caption" color="text.secondary">SOURCES</Typography>
        <Stack spacing={0.65} sx={{mt:.7}}>
          {selected.sources.map((source,i)=><Stack key={i} direction="row" justifyContent="space-between" spacing={1} sx={{p:.85,bgcolor:'action.hover',borderRadius:1.4}}>
            <Typography variant="body2" sx={{fontWeight:700,overflowWrap:'anywhere'}}>{source.name}</Typography>
            <Chip size="small" label={source.type.toUpperCase()}/>
          </Stack>)}
        </Stack>

        {selected.description&&<>
          <Divider sx={{my:1.5}}/>
          <Typography variant="caption" color="text.secondary">DESCRIPTION</Typography>
          <Typography variant="body2" sx={{mt:.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.description}</Typography>
        </>}
      </Paper>}
    </Box>}
  </Stack>
}
