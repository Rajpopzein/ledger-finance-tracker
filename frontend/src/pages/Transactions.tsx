import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import type {Tx} from '../types'
import {api} from '../api/client'
import {usePeriod} from '../period'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n)
const upiLabel=(t:Tx)=>t.sources.find(s=>s.type==='upi_app')?.name

export default function Transactions(){
  const {period,setPeriodKey}=usePeriod()
  const {familyScope,familyUserId,scopeLabel}=useFamily()
  const {resolvedMode}=useUI()
  const [q,setQ]=useState('')
  const [items,setItems]=useState<Tx[]>([])
  const [selected,setSelected]=useState<Tx|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    const t=setTimeout(async()=>{
      setLoading(true)
      setError('')
      try{
        const x=await api.transactions(q,period.from,period.to,familyScope,familyUserId)
        setItems(x)
        setSelected(prev=>x.find(i=>i.id===prev?.id)||x[0]||null)
      }catch(e:any){
        setItems([])
        setSelected(null)
        setError(e.message||'Could not load transactions.')
      }finally{
        setLoading(false)
      }
    },200)
    return()=>clearTimeout(t)
  },[q,period.from,period.to,familyScope,familyUserId])

  const clay=claySx(resolvedMode)

  return <Stack spacing={2.2}>
    <Box>
      <Typography variant="overline" color="text.secondary">{period.label.toUpperCase()} · {scopeLabel.toUpperCase()}</Typography>
      <Typography variant="h1">Transactions</Typography>
    </Box>

    <TextField
      fullWidth
      value={q}
      onChange={e=>setQ(e.target.value)}
      placeholder="Search transactions, merchants or references…"
      InputProps={{startAdornment:<SearchRoundedIcon sx={{mr:1,color:'text.secondary'}}/>}}
    />

    {loading&&<Stack spacing={1}>
      {[1,2,3,4].map(i=><Skeleton key={i} variant="rounded" height={76} sx={{borderRadius:3}}/>)}
    </Stack>}

    {error&&<Alert severity="error">{error}</Alert>}

    {!loading&&!error&&<Box sx={{
      display:'grid',
      gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 360px'},
      gap:2,
      alignItems:'start',
    }}>
      <Paper sx={{...clay,p:{xs:1,sm:1.5},minWidth:0}}>
        <Stack divider={<Divider/>}>
          {items.map(t=><Box
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
              borderRadius:2.5,
              p:{xs:1.2,sm:1.4},
              display:'grid',
              gridTemplateColumns:{xs:'1fr auto',sm:'minmax(0,2fr) minmax(110px,1fr) minmax(110px,1fr) auto'},
              gap:{xs:.8,sm:1.5},
              alignItems:'center',
              '&:hover':{bgcolor:'action.hover'},
            }}
          >
            <Box sx={{minWidth:0}}>
              <Typography fontWeight={750} noWrap>{t.merchant||'Transaction'}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{t.category} · {t.txn_type.replace('_',' ')}</Typography>
              <Stack direction="row" gap=.6 sx={{mt:.6,flexWrap:'wrap'}}>
                {t.user&&<Chip size="small" variant="outlined" label={`${t.user.name} · ${t.user.handle}`}/>}
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
              <Typography fontWeight={800} color={t.direction==='credit'?'primary.main':'text.primary'}>
                {t.direction==='credit'?'+':'-'}{money(t.amount)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{display:{xs:'block',sm:'none'}}}>
                {new Date(t.txn_at).toLocaleDateString('en-IN')}
              </Typography>
            </Box>
          </Box>)}

          {!items.length&&<Box sx={{p:3,textAlign:'center'}}>
            <Typography fontWeight={700}>No transactions for {scopeLabel} in {period.label}.</Typography>
            {period.key!=='all'&&<Button sx={{mt:1}} onClick={()=>setPeriodKey('all')}>Show all dates</Button>}
          </Box>}
        </Stack>
      </Paper>

      {selected&&<Paper sx={{...clay,p:2.2,minWidth:0,position:{lg:'sticky'},top:{lg:92}}}>
        <Typography variant="overline" color="text.secondary">TRANSACTION DETAILS</Typography>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{mt:.5}}>
          <Box sx={{minWidth:0}}>
            <Typography variant="h2" sx={{overflowWrap:'anywhere'}}>{selected.merchant||'Transaction'}</Typography>
            <Typography variant="caption" color="text.secondary">{new Date(selected.txn_at).toLocaleString('en-IN')}</Typography>
          </Box>
          <Typography fontWeight={850} sx={{fontSize:'1.3rem',flex:'0 0 auto'}}>{money(selected.amount)}</Typography>
        </Stack>

        <Divider sx={{my:2}}/>

        <Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1.4}}>
          <Box><Typography variant="caption" color="text.secondary">Category</Typography><Typography fontWeight={700}>{selected.category}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Account</Typography><Typography fontWeight={700} sx={{overflowWrap:'anywhere'}}>{selected.account}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">User</Typography><Typography fontWeight={700}>{selected.user?.name||'Unknown'}</Typography><Typography variant="caption" color="text.secondary">{selected.user?.handle||''}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Status</Typography><Typography fontWeight={700}>{selected.verification_status.replace('_',' ')}</Typography></Box>
        </Box>

        <Divider sx={{my:2}}/>
        <Typography variant="caption" color="text.secondary">SOURCES</Typography>
        <Stack spacing=.8 sx={{mt:.8}}>
          {selected.sources.map((s,i)=><Stack key={i} direction="row" justifyContent="space-between" spacing={1} sx={{p:1,bgcolor:'action.hover',borderRadius:2}}>
            <Typography variant="body2" fontWeight={700} sx={{overflowWrap:'anywhere'}}>{s.name}</Typography>
            <Chip size="small" label={s.type.toUpperCase()}/>
          </Stack>)}
        </Stack>

        {selected.description&&<>
          <Divider sx={{my:2}}/>
          <Typography variant="caption" color="text.secondary">DESCRIPTION</Typography>
          <Typography variant="body2" sx={{mt:.8,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.description}</Typography>
        </>}
      </Paper>}
    </Box>}
  </Stack>
}
