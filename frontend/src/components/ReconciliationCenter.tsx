import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',
  currency:'INR',
  maximumFractionDigits:0,
}).format(n)

export default function ReconciliationCenter(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const [items,setItems]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState<number|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function load(){
    setLoading(true)
    setError('')
    try{
      const result=await api.reconciliation('needs_review')
      setItems(result?.items||[])
    }catch(e:any){
      setItems([])
      setError(e.message||'Could not load reconciliation items.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[])

  async function resolve(id:number,action:'merge'|'keep_both'|'ignore'){
    if(action==='keep_both'&&!window.confirm('Keep both transactions? This confirms they are two separate real transactions.'))return
    setBusy(id)
    setError('')
    setNotice('')
    try{
      await api.resolveReconciliation(id,action)
      setNotice(
        action==='merge'
          ? 'Statement row merged with the existing transaction.'
          : action==='keep_both'
            ? 'Statement row kept as a separate transaction.'
            : 'Statement row ignored.'
      )
      await load()
    }catch(e:any){
      setError(e.message||'Could not resolve this item.')
    }finally{
      setBusy(null)
    }
  }

  return <Stack spacing={1.5}>
    <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography variant="h2">Reconciliation Center</Typography>
          <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
            Review statement rows that Ledger could not match safely. Nothing here is double-counted until you choose what it represents.
          </Typography>
        </Box>
        <Chip
          color={items.length?'warning':'success'}
          variant="outlined"
          label={loading?'Checking…':items.length?`${items.length} need review`:'All reconciled'}
        />
      </Stack>
    </Paper>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    {!loading&&!items.length&&<Alert severity="success">
      No unresolved statement rows. Your imported transactions are reconciled.
    </Alert>}

    {items.map(item=><Paper key={item.id} sx={{...clay,p:{xs:1.4,sm:2}}}>
      <Stack spacing={1.4}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1}>
          <Box>
            <Typography fontWeight={850}>{item.description||'Statement transaction'}</Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(item.txn_at).toLocaleString('en-IN')} · {item.source_name}
            </Typography>
          </Box>
          <Typography
            sx={{fontWeight:850,fontSize:'1.2rem'}}
            color={item.direction==='credit'?'primary.main':'text.primary'}
          >
            {item.direction==='credit'?'+':'-'}{money(item.amount)}
          </Typography>
        </Stack>

        {item.candidate?<Box sx={{
          display:'grid',
          gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},
          gap:1,
        }}>
          <Paper variant="outlined" sx={{p:1.25,borderRadius:2}}>
            <Typography variant="caption" color="text.secondary">STATEMENT ROW</Typography>
            <Typography variant="body2" fontWeight={750} sx={{mt:.35}}>{item.description||'No description'}</Typography>
            <Typography variant="caption" color="text.secondary">
              Match: {item.match_method||'possible'}{item.match_score!=null?` · ${Math.round(item.match_score*100)}%`:''}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{p:1.25,borderRadius:2}}>
            <Typography variant="caption" color="text.secondary">EXISTING LEDGER ENTRY</Typography>
            <Typography variant="body2" fontWeight={750} sx={{mt:.35}}>
              {item.candidate.merchant||item.candidate.description||'Transaction'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(item.candidate.txn_at).toLocaleString('en-IN')} · {money(item.candidate.amount)}
            </Typography>
          </Paper>
        </Box>:<Alert severity="warning">
          Ledger found a possible conflict but no safe single candidate. Review the statement row before keeping it.
        </Alert>}

        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          {item.candidate&&<Button
            variant="contained"
            startIcon={<CompareArrowsRoundedIcon/>}
            disabled={busy===item.id}
            onClick={()=>resolve(item.id,'merge')}
          >
            Merge
          </Button>}
          <Button
            variant="outlined"
            startIcon={<CallSplitRoundedIcon/>}
            disabled={busy===item.id}
            onClick={()=>resolve(item.id,'keep_both')}
          >
            Keep both
          </Button>
          <Button
            color="inherit"
            startIcon={<VisibilityOffRoundedIcon/>}
            disabled={busy===item.id}
            onClick={()=>resolve(item.id,'ignore')}
          >
            Ignore
          </Button>
        </Stack>
      </Stack>
    </Paper>)}
  </Stack>
}
