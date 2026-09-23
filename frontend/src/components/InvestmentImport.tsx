import {useState} from 'react'
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)

export default function InvestmentImport(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const [platform,setPlatform]=useState('Groww')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function inspect(selected:File){
    setFile(selected);setPreview(null);setError('');setNotice('');setBusy('preview')
    try{
      setPreview(await api.investmentPreview(platform,selected))
    }catch(e:any){
      setError(e.message||'Could not read this holdings file.')
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
    }catch(e:any){
      setError(e.message||'Could not import holdings.')
    }finally{
      setBusy('')
    }
  }

  return <Stack spacing={1.5}>
    <Paper sx={{...clay,p:{xs:1.5,sm:2.1}}}>
      <Typography variant="h2">Import investments</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.5,mb:1.5}}>
        Import broker holdings from CSV, XLSX or XLS. Re-importing updates matching symbols instead of creating duplicates.
      </Typography>

      <Stack spacing={1.5}>
        <FormControl size="small">
          <InputLabel>Platform</InputLabel>
          <Select label="Platform" value={platform} onChange={e=>{setPlatform(String(e.target.value));setPreview(null);setFile(null)}}>
            <MenuItem value="Groww">Groww</MenuItem>
            <MenuItem value="Zerodha">Zerodha</MenuItem>
            <MenuItem value="Upstox">Upstox</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
          </Select>
        </FormControl>

        <Button
          component="label"
          variant="outlined"
          startIcon={<CloudUploadRoundedIcon/>}
          disabled={!!busy}
          sx={{minHeight:88,borderStyle:'dashed',width:'100%'}}
        >
          {busy==='preview'?'Reading holdings…':file?.name||'Choose holdings file'}
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
      </Stack>
    </Paper>

    {error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}

    {preview&&<Paper sx={{...clay,p:{xs:1.5,sm:2.1}}}>
      <Typography variant="h2">Investment preview</Typography>
      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},
        gap:1.5,
        mt:1.5,
      }}>
        <Box><Typography variant="caption" color="text.secondary">Holdings</Typography><Typography sx={{fontWeight:800}}>{preview.detected}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Invested</Typography><Typography sx={{fontWeight:800}}>{money(preview.invested_amount)}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Current</Typography><Typography sx={{fontWeight:800}}>{money(preview.current_value)}</Typography></Box>
      </Box>
      <Button variant="contained" onClick={commit} disabled={busy==='commit'} sx={{mt:1.5}}>
        {busy==='commit'?'Importing…':'Import holdings'}
      </Button>
    </Paper>}
  </Stack>
}
