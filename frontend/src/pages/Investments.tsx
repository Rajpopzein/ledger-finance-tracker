import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import type {InvestmentHolding,InvestmentList} from '../types'
import {api} from '../api/client'
import {useFamily} from '../family'
import {useAppData} from '../appData'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const emptyForm=()=>({
  platform:'Manual',
  asset_type:'equity',
  symbol:'',
  name:'',
  quantity:'',
  average_price:'',
  invested_amount:'',
  current_price:'',
  current_value:'',
})

export default function Investments(){
  const {resolvedMode}=useUI()
  const {familyScope,familyUserId,scopeLabel,linkedUsers}=useFamily()
  const {auth}=useAppData()
  const clay=claySx(resolvedMode)
  const canManage=familyScope==='self'&&!familyUserId
  const [data,setData]=useState<InvestmentList>({items:[],invested_amount:0,current_value:0,pnl:0,count:0})
  const [form,setForm]=useState(emptyForm())
  const [editId,setEditId]=useState<number|null>(null)
  const [editForm,setEditForm]=useState(emptyForm())
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function load(){
    setError('')
    try{setData(await api.investments(familyScope,familyUserId))}
    catch(e:any){
      setData({items:[],invested_amount:0,current_value:0,pnl:0,count:0})
      setError(e.message||'Could not load investments.')
    }
  }

  useEffect(()=>{load()},[familyScope,familyUserId])

  async function addManual(){
    if(!form.symbol.trim())return
    setBusy('manual');setError('');setNotice('')
    try{
      const quantity=Number(form.quantity||0)
      const averagePrice=form.average_price?Number(form.average_price):null
      const invested=form.invested_amount
        ? Number(form.invested_amount)
        : quantity&&averagePrice!=null
          ? quantity*averagePrice
          : 0
      const currentPrice=form.current_price?Number(form.current_price):null
      const currentValue=form.current_value
        ? Number(form.current_value)
        : quantity&&currentPrice!=null
          ? quantity*currentPrice
          : null

      await api.createInvestment({
        platform:form.platform||'Manual',
        asset_type:form.asset_type||'equity',
        symbol:form.symbol.trim(),
        name:form.name.trim()||null,
        quantity,
        average_price:averagePrice,
        invested_amount:invested,
        current_price:currentPrice,
        current_value:currentValue,
        as_of_date:new Date().toISOString(),
      })
      setForm(emptyForm())
      setNotice('Investment added.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not add investment.')
    }finally{
      setBusy('')
    }
  }

  function startEdit(item:InvestmentHolding){
    setEditId(item.id)
    setEditForm({
      platform:item.platform||'Manual',
      asset_type:item.asset_type||'equity',
      symbol:item.symbol||'',
      name:item.name||'',
      quantity:String(item.quantity??''),
      average_price:item.average_price!=null?String(item.average_price):'',
      invested_amount:String(item.invested_amount??''),
      current_price:item.current_price!=null?String(item.current_price):'',
      current_value:item.current_value!=null?String(item.current_value):'',
    })
    setError('')
    setNotice('')
  }

  async function saveEdit(item:InvestmentHolding){
    if(!editForm.symbol.trim())return
    setBusy('edit:'+item.id);setError('');setNotice('')
    try{
      await api.updateInvestment(item.id,{
        platform:editForm.platform||'Manual',
        asset_type:editForm.asset_type||'equity',
        symbol:editForm.symbol.trim(),
        name:editForm.name.trim()||null,
        quantity:Number(editForm.quantity||0),
        average_price:editForm.average_price?Number(editForm.average_price):null,
        invested_amount:Number(editForm.invested_amount||0),
        current_price:editForm.current_price?Number(editForm.current_price):null,
        current_value:editForm.current_value?Number(editForm.current_value):null,
        as_of_date:new Date().toISOString(),
      })
      setEditId(null)
      setNotice('Investment updated.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not update investment.')
    }finally{
      setBusy('')
    }
  }

  async function remove(item:InvestmentHolding){
    if(!window.confirm(`Delete ${item.symbol} from investments?`))return
    setBusy('delete:'+item.id);setError('');setNotice('')
    try{
      await api.deleteInvestment(item.id)
      setNotice(item.symbol+' removed.')
      if(editId===item.id)setEditId(null)
      await load()
    }catch(e:any){
      setError(e.message||'Could not remove investment.')
    }finally{
      setBusy('')
    }
  }

  const byPlatform=useMemo(()=>{
    const groups:Record<string,InvestmentHolding[]>={}
    for(const item of data.items)(groups[item.platform]??=[]).push(item)
    return groups
  },[data.items])

  const ownerName=(userId?:number)=>{
    if(userId===auth?.user_id)return 'You'
    return linkedUsers.find(user=>user.id===userId)?.name||'Family'
  }

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">PORTFOLIO</Typography>
      <Typography variant="h1">Investments</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        Add and manage holdings here. Broker file imports are under Import → Investments.
      </Typography>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},gap:1}}>
      {[
        ['Invested',money(data.invested_amount)],
        ['Current value',money(data.current_value)],
        ['P&L',`${data.pnl>=0?'+':''}${money(data.pnl)}`],
      ].map(([label,value])=><Paper key={label} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography sx={{fontWeight:850,fontSize:'1.25rem',mt:.25}}>{value}</Typography>
      </Paper>)}
    </Box>

    {!canManage&&<Alert severity="info">
      Viewing {scopeLabel} investments in read-only mode. Only holdings explicitly shared with you are returned.
    </Alert>}
    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    {canManage&&<Paper sx={{...clay,p:{xs:1.4,sm:1.9}}}>
      <Typography variant="h2">Add investment manually</Typography>
      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr',lg:'repeat(3,1fr)'},
        columnGap:1.5,
        rowGap:1.5,
        mt:1.5,
      }}>
        <TextField label="Platform" value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}/>
        <TextField label="Asset type" value={form.asset_type} onChange={e=>setForm({...form,asset_type:e.target.value})}/>
        <TextField label="Symbol" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value.toUpperCase()})}/>
        <TextField label="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <TextField label="Quantity" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/>
        <TextField label="Average price" type="number" value={form.average_price} onChange={e=>setForm({...form,average_price:e.target.value})}/>
        <TextField label="Invested amount" type="number" value={form.invested_amount} onChange={e=>setForm({...form,invested_amount:e.target.value})}/>
        <TextField label="Current price" type="number" value={form.current_price} onChange={e=>setForm({...form,current_price:e.target.value})}/>
        <TextField label="Current value" type="number" value={form.current_value} onChange={e=>setForm({...form,current_value:e.target.value})}/>
      </Box>
      <Button variant="contained" startIcon={<AddRoundedIcon/>} sx={{mt:1.5}} onClick={addManual} disabled={busy==='manual'||!form.symbol.trim()}>
        {busy==='manual'?'Saving…':'Add investment'}
      </Button>
    </Paper>}

    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
        <Typography variant="h2">Holdings</Typography>
        <Chip size="small" label={data.count}/>
      </Stack>

      <Stack spacing={1.1}>
        {Object.entries(byPlatform).map(([broker,items])=><Paper key={broker} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
          <Typography variant="overline" color="text.secondary">{broker}</Typography>
          <Stack divider={<Divider/>} sx={{mt:.4}}>
            {items.map(item=>{
              const editing=editId===item.id
              return <Box key={item.id} sx={{py:1}}>
                {editing?<Box sx={{
                  display:'grid',
                  gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr',lg:'repeat(3,1fr)'},
                  columnGap:1.5,
                  rowGap:1.5,
                }}>
                  <TextField label="Platform" value={editForm.platform} onChange={e=>setEditForm({...editForm,platform:e.target.value})}/>
                  <TextField label="Asset type" value={editForm.asset_type} onChange={e=>setEditForm({...editForm,asset_type:e.target.value})}/>
                  <TextField label="Symbol" value={editForm.symbol} onChange={e=>setEditForm({...editForm,symbol:e.target.value.toUpperCase()})}/>
                  <TextField label="Name" value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})}/>
                  <TextField label="Quantity" type="number" value={editForm.quantity} onChange={e=>setEditForm({...editForm,quantity:e.target.value})}/>
                  <TextField label="Average price" type="number" value={editForm.average_price} onChange={e=>setEditForm({...editForm,average_price:e.target.value})}/>
                  <TextField label="Invested amount" type="number" value={editForm.invested_amount} onChange={e=>setEditForm({...editForm,invested_amount:e.target.value})}/>
                  <TextField label="Current price" type="number" value={editForm.current_price} onChange={e=>setEditForm({...editForm,current_price:e.target.value})}/>
                  <TextField label="Current value" type="number" value={editForm.current_value} onChange={e=>setEditForm({...editForm,current_value:e.target.value})}/>
                  <Stack direction="row" spacing={1} sx={{gridColumn:{sm:'1 / -1'}}}>
                    <Button variant="contained" startIcon={<SaveRoundedIcon/>} onClick={()=>saveEdit(item)} disabled={busy==='edit:'+item.id}>Save</Button>
                    <Button onClick={()=>setEditId(null)}>Cancel</Button>
                  </Stack>
                </Box>:<Box sx={{
                  display:'grid',
                  gridTemplateColumns:canManage
                    ? {xs:'minmax(0,1fr) auto',sm:'minmax(0,1.4fr) .7fr .8fr .8fr auto'}
                    : {xs:'minmax(0,1fr) auto',sm:'minmax(0,1.4fr) .7fr .8fr .8fr'},
                  gap:1,
                  alignItems:'center',
                }}>
                  <Box sx={{minWidth:0}}>
                    <Typography variant="body2" sx={{fontWeight:800,overflowWrap:'anywhere'}}>{item.symbol}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{display:'block',overflowWrap:'anywhere'}}>
                      {item.name||item.asset_type} · {item.quantity.toLocaleString('en-IN')} units{!canManage?' · '+ownerName(item.user_id):''}
                    </Typography>
                  </Box>
                  <Box sx={{display:{xs:'none',sm:'block'}}}>
                    <Typography variant="caption" color="text.secondary">Invested</Typography>
                    <Typography variant="body2" sx={{fontWeight:700}}>{money(item.invested_amount)}</Typography>
                  </Box>
                  <Box sx={{display:{xs:'none',sm:'block'}}}>
                    <Typography variant="caption" color="text.secondary">Current</Typography>
                    <Typography variant="body2" sx={{fontWeight:700}}>{money(item.current_value??item.invested_amount)}</Typography>
                  </Box>
                  <Box sx={{textAlign:{xs:'right',sm:'left'}}}>
                    <Typography variant="caption" color="text.secondary" sx={{display:{xs:'none',sm:'block'}}}>P&L</Typography>
                    <Typography variant="body2" sx={{fontWeight:800}} color={(item.pnl??0)>=0?'primary.main':'error.main'}>
                      {(item.pnl??0)>=0?'+':''}{money(item.pnl??0)}
                    </Typography>
                  </Box>
                  {canManage&&<Stack direction="row" spacing={0.5} sx={{gridColumn:{xs:'1 / -1',sm:'auto'},justifySelf:{xs:'start',sm:'end'}}}>
                    <Button size="small" startIcon={<EditRoundedIcon/>} onClick={()=>startEdit(item)}>Edit</Button>
                    <Button size="small" color="error" startIcon={<DeleteOutlineRoundedIcon/>} disabled={busy==='delete:'+item.id} onClick={()=>remove(item)}>Delete</Button>
                  </Stack>}
                </Box>}
              </Box>
            })}
          </Stack>
        </Paper>)}

        {!data.items.length&&<Paper sx={{...clay,p:1.5}}>
          <Typography variant="body2" color="text.secondary">No investments added yet.</Typography>
        </Paper>}
      </Stack>
    </Box>
  </Stack>
}
