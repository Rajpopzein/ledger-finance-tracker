import {useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
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

export default function UPIImport(){
  const {resolvedMode}=useUI()
  const [app,setApp]=useState('google_pay')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<any>(null)
  const [busy,setBusy]=useState<'idle'|'preview'|'commit'>('idle')
  const [error,setError]=useState('')

  async function inspect(selected:File){
    setFile(selected)
    setPreview(null)
    setError('')
    setBusy('preview')
    try{
      setPreview(await api.upiPreview(app,selected))
    }catch(e:any){
      setError(e.message||'Could not read this UPI export.')
    }finally{
      setBusy('idle')
    }
  }

  async function commit(){
    if(!file)return
    setBusy('commit')
    setError('')
    try{
      const result=await api.upiCommit(app,file)
      setPreview({...preview,committed:result})
    }catch(e:any){
      setError(e.message||'Could not import this UPI history.')
    }finally{
      setBusy('idle')
    }
  }

  const clay=claySx(resolvedMode)

  return <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 340px'},gap:2}}>
    <Stack spacing={2}>
      <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
        <Stack spacing={1.6}>
          <FormControl size="small">
            <InputLabel>UPI app</InputLabel>
            <Select
              label="UPI app"
              value={app}
              disabled={busy!=='idle'}
              onChange={e=>{setApp(String(e.target.value));setPreview(null);setFile(null)}}
            >
              <MenuItem value="google_pay">Google Pay</MenuItem>
              <MenuItem value="phonepe">PhonePe</MenuItem>
            </Select>
          </FormControl>

          <Alert severity="info">
            No bank selection is required. Ledger searches all of your accounts for a matching UPI/UTR transaction.
            Unmatched transactions go to <b>UPI • Unassigned</b>.
          </Alert>

          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadRoundedIcon/>}
            disabled={busy!=='idle'}
            sx={{minHeight:110,borderStyle:'dashed',display:'flex',flexDirection:'column',gap:.5}}
          >
            <Typography fontWeight={750}>{busy==='preview'?'Checking UPI history…':file?'Choose another export':'Choose UPI export'}</Typography>
            <Typography variant="caption" color="text.secondary">{file?.name||'CSV, XLSX, XLS, JSON or PDF'}</Typography>
            <input
              hidden
              type="file"
              accept=".csv,.xlsx,.xls,.json,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"
              onChange={e=>{
                const selected=e.target.files?.[0]
                if(selected){
                  const name=selected.name.toLowerCase()
                  const allowed=name.endsWith('.csv')||name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.json')||name.endsWith('.pdf')||selected.type==='application/pdf'
                  if(!allowed)setError('Unsupported file. Choose CSV, XLSX, XLS, JSON or PDF.')
                  else inspect(selected)
                }
                e.currentTarget.value=''
              }}
            />
          </Button>
        </Stack>
      </Paper>

      {error&&<Alert severity="error">{error}</Alert>}

      {preview&&<Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1} sx={{mb:2}}>
          <Box><Typography variant="overline" color="text.secondary">UPI IMPORT</Typography><Typography variant="h2">{preview.app}</Typography></Box>
          {file&&<Chip label={file.name} variant="outlined" sx={{maxWidth:{xs:'100%',sm:260}}}/>}
        </Stack>

        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',sm:'repeat(4,1fr)'},gap:1,mb:1.5}}>
          {[
            ['FOUND',preview.detected||0],
            ['NEW',preview.new||0],
            ['EXISTING',preview.existing||0],
            ['REVIEW',preview.review||0]
          ].map(([label,value])=><Paper variant="outlined" key={String(label)} sx={{p:1.2,borderRadius:2.5}}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h2">{value}</Typography>
          </Paper>)}
        </Box>

        <Stack direction="row" spacing={1} sx={{mb:1.5}}>
          <Chip size="small" label={`${preview.debits||0} debits`}/>
          <Chip size="small" label={`${preview.credits||0} credits`}/>
        </Stack>

        {preview.already_imported
          ? <Alert severity="warning">This exact {preview.app} export has already been imported.</Alert>
          : preview.committed
            ? <Alert severity="success">
                {preview.committed.inserted} new transactions added, {preview.committed.linked} existing transactions linked, and {preview.committed.review} left for review.
                {preview.committed.inserted>0&&<> New unmatched items are in <b>{preview.committed.fallback_account}</b>.</>}
              </Alert>
            : <Stack spacing={1.4}>
                <Typography variant="body2" color="text.secondary">
                  Existing matches keep their bank account and gain the {preview.app} source label. Only unmatched transactions are created under UPI • Unassigned.
                </Typography>
                <Button variant="contained" onClick={commit} disabled={busy!=='idle'||!file}>
                  {busy==='commit'?'Importing…':`Import ${preview.new||0} new + link ${preview.existing||0}`}
                </Button>
              </Stack>
        }
      </Paper>}
    </Stack>

    <Paper sx={{...clay,p:2.2,height:'fit-content'}}>
      <Typography variant="h2">UPI reconciliation</Typography>
      <Stack spacing={1.4} sx={{mt:1.6}}>
        {[
          'Read successful Google Pay / PhonePe transactions',
          'Search all your accounts for UPI ID, UTR or RRN',
          'Verify amount, date and direction',
          'Attach the UPI app label to matching bank transactions',
          'Place unmatched transactions in UPI • Unassigned',
        ].map((step,index)=><Stack key={step} direction="row" spacing={1.1} alignItems="flex-start">
          <Chip size="small" label={index+1} color="primary"/>
          <Typography variant="body2">{step}</Typography>
        </Stack>)}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>
        Searchable PDFs are supported. Image-only PDFs are rejected rather than OCRed automatically. Ambiguous amount/date matches stay in Review.
      </Typography>
    </Paper>
  </Box>
}
