import {useEffect,useMemo,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import type {InvestmentHolding,InvestmentList} from '../types'
import {api} from '../api/client'
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
  const clay=claySx(resolvedMode)
  const [data,setData]=useState<InvestmentList>({items:[],invested_amount:0,current_value:0,pnl:0,count:0})
  const [form,setForm]=useState(emptyForm())
  const [platform,setPlatform]=useState('Groww')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function load(){
    try{setData(await api.investments())}
    catch(e:any){setError(e.message||'Could not load investments.')}
  }

  useEffect(()=>{load()},[])

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

  async function inspect(selected:File){
    setFile(selected);setPreview(null);setError('');setNotice('');setBusy('preview')
    try{
      setPreview(await api.investmentPreview(platform,selected))
    }catch(e:any){
      setError(e.message||'Could not read this broker holdings file.')
    }finally{
      setBusy('')
    }
  }

  async function commit(){
    if(!file)return
    setBusy('commit');setError('');setNotice('')
    try{
      const result=await api.investmentCommit(platform,file)
      setNotice(`Imported ${result.inserted} new holdings and updated ${result.updated} existing holdings.`)
      setPreview(null);setFile(null)
      await load()
    }catch(e:any){
      setError(e.message||'Could not import holdings.')
    }finally{
      setBusy('')
    }
  }

  async function remove(holding:InvestmentHolding){
    setBusy('delete:'+holding.id);setError('');setNotice('')
    try{
      await api.deleteInvestment(holding.id)
      setNotice(holding.symbol+' removed.')
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

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">PORTFOLIO</Typography>
      <Typography variant="h1">Investments</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        Track holdings separately from expenses. Investment purchases do not reduce the Spending metric.
      </Typography>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},gap:1}}>
      {[
        ['Invested',money(data.invested_amount)],
        ['Current value',money(data.current_value)],
        ['P&L',`${data.pnl>=0?'+':''}${money(data.pnl)}`],
      ].map(([label,value])=><Paper key={label} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography sx={{fontWeight:850,fontSize:'1.25rem',mt:.2}}>{value}</Typography>
      </Paper>)}
    </Box>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:{xs:1.2,sm:2}}}>
      <Paper sx={{...clay,p:{xs:1.4,sm:1.9}}}>
        <Typography variant="h2">Add manually</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.35,mb:1.2}}>
          Add stocks, mutual funds, ETFs or other holdings yourself.
        </Typography>

        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1}}>
          <FormControl size="small">
            <InputLabel>Platform</InputLabel>
            <Select label="Platform" value={form.platform} onChange={e=>setForm({...form,platform:String(e.target.value)})}>
              <MenuItem value="Manual">Manual</MenuItem>
              <MenuItem value="Groww">Groww</MenuItem>
              <MenuItem value="Zerodha">Zerodha</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Asset type</InputLabel>
            <Select label="Asset type" value={form.asset_type} onChange={e=>setForm({...form,asset_type:String(e.target.value)})}>
              <MenuItem value="equity">Stock / Equity</MenuItem>
              <MenuItem value="mutual_fund">Mutual fund</MenuItem>
              <MenuItem value="etf">ETF</MenuItem>
              <MenuItem value="bond">Bond</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Symbol / Scheme" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})}/>
          <TextField label="Name (optional)" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <TextField label="Quantity / Units" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/>
          <TextField label="Average price / NAV" type="number" value={form.average_price} onChange={e=>setForm({...form,average_price:e.target.value})}/>
          <TextField label="Invested amount" type="number" value={form.invested_amount} onChange={e=>setForm({...form,invested_amount:e.target.value})} helperText="Optional when quantity × average price is available."/>
          <TextField label="Current price / NAV" type="number" value={form.current_price} onChange={e=>setForm({...form,current_price:e.target.value})}/>
          <TextField label="Current value" type="number" value={form.current_value} onChange={e=>setForm({...form,current_value:e.target.value})} helperText="Optional when quantity × current price is available."/>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddRoundedIcon/>}
          onClick={addManual}
          disabled={busy==='manual'||!form.symbol.trim()}
          sx={{mt:1.2}}
        >
          {busy==='manual'?'Adding…':'Add investment'}
        </Button>
      </Paper>

      <Paper sx={{...clay,p:{xs:1.4,sm:1.9}}}>
        <Typography variant="h2">Import broker holdings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.35,mb:1.2}}>
          Import holdings exports from Groww, Zerodha or another broker. Supported files: CSV, XLSX and XLS.
        </Typography>

        <FormControl size="small" fullWidth sx={{mb:1}}>
          <InputLabel>Broker / platform</InputLabel>
          <Select label="Broker / platform" value={platform} onChange={e=>{setPlatform(String(e.target.value));setPreview(null);setFile(null)}}>
            <MenuItem value="Groww">Groww</MenuItem>
            <MenuItem value="Zerodha">Zerodha</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
          </Select>
        </FormControl>

        <Button
          component="label"
          variant="outlined"
          startIcon={<CloudUploadRoundedIcon/>}
          disabled={busy==='preview'||busy==='commit'}
          sx={{minHeight:88,width:'100%',borderStyle:'dashed'}}
        >
          {busy==='preview'?'Reading holdings…':file?file.name:'Choose holdings file'}
          <input
            hidden
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e=>{
              const selected=e.target.files?.[0]
              if(selected)inspect(selected)
              e.currentTarget.value=''
            }}
          />
        </Button>

        {preview&&<Box sx={{mt:1.2}}>
          <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:.75}}>
            <Box><Typography variant="caption" color="text.secondary">Holdings</Typography><Typography sx={{fontWeight:800}}>{preview.detected}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Invested</Typography><Typography sx={{fontWeight:800}}>{money(preview.invested_amount)}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Current</Typography><Typography sx={{fontWeight:800}}>{money(preview.current_value)}</Typography></Box>
          </Box>
          <Alert severity="info" sx={{mt:1}}>
            Importing again updates matching {platform} symbols instead of creating duplicate holdings.
          </Alert>
          <Button variant="contained" onClick={commit} disabled={busy==='commit'} sx={{mt:1}}>
            {busy==='commit'?'Importing…':'Import holdings'}
          </Button>
        </Box>}

        <Divider sx={{my:1.5}}/>
        <Typography variant="caption" color="text.secondary">
          The importer searches the first rows for common broker columns such as Symbol/Instrument, Quantity, Avg Price, Invested Amount, LTP and Current Value.
        </Typography>
      </Paper>
    </Box>

    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
        <Typography variant="h2">Holdings</Typography>
        <Chip size="small" label={data.count}/>
      </Stack>

      <Stack spacing={1.1}>
        {Object.entries(byPlatform).map(([broker,items])=><Paper key={broker} sx={{...clay,p:{xs:1.25,sm:1.6}}}>
          <Typography variant="overline" color="text.secondary">{broker}</Typography>
          <Stack divider={<Divider/>} sx={{mt:.4}}>
            {items.map(item=><Box key={item.id} sx={{
              py:1,
              display:'grid',
              gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(0,1.4fr) .7fr .8fr .8fr auto'},
              gap:1,
              alignItems:'center',
            }}>
              <Box sx={{minWidth:0}}>
                <Typography variant="body2" sx={{fontWeight:800,overflowWrap:'anywhere'}}>{item.symbol}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{display:'block',overflowWrap:'anywhere'}}>
                  {item.name||item.asset_type} · {item.quantity.toLocaleString('en-IN')} units
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
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineRoundedIcon/>}
                disabled={busy==='delete:'+item.id}
                onClick={()=>remove(item)}
                sx={{gridColumn:{xs:'1 / -1',sm:'auto'},justifySelf:{xs:'start',sm:'end'}}}
              >
                Remove
              </Button>
            </Box>)}
          </Stack>
        </Paper>)}

        {!data.items.length&&<Paper sx={{...clay,p:1.5}}>
          <Typography variant="body2" color="text.secondary">No investments added yet.</Typography>
        </Paper>}
      </Stack>
    </Box>
  </Stack>
}
