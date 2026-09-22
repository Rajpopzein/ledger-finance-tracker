import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const endpoint=(import.meta.env.VITE_API_URL||'/api')+'/shortcuts/transaction'

export default function ShortcutsSetup(){
  const {resolvedMode}=useUI()
  const [status,setStatus]=useState<any>(null)
  const [token,setToken]=useState('')
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  const [error,setError]=useState('')
  const clay=claySx(resolvedMode)

  async function load(){
    try{setStatus(await api.shortcutStatus())}
    catch(e:any){setError(e.message||'Could not load Shortcuts settings.')}
  }

  useEffect(()=>{load()},[])

  async function generate(){
    setBusy(true);setMsg('');setError('')
    try{
      const result=await api.shortcutCreateToken()
      setToken(result.token||'')
      setMsg(status?.configured?'Shortcut token rotated. Update your iPhone shortcut with the new token.':'Shortcut token created.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not create shortcut token.')
    }finally{
      setBusy(false)
    }
  }

  async function revoke(){
    setBusy(true);setMsg('');setError('')
    try{
      await api.shortcutRevokeToken()
      setToken('')
      setMsg('Shortcut token revoked. Existing iPhone shortcuts can no longer add transactions.')
      await load()
    }catch(e:any){
      setError(e.message||'Could not revoke shortcut token.')
    }finally{
      setBusy(false)
    }
  }

  async function copy(value:string,label:string){
    try{
      await navigator.clipboard.writeText(value)
      setMsg(label+' copied.')
    }catch{
      setError('Copy failed. Select the value manually.')
    }
  }

  return <Stack spacing={1.4}>
    <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
      <Stack direction="row" spacing={1} alignItems="center">
        <PhoneIphoneRoundedIcon color="primary"/>
        <Box>
          <Typography variant="h2">iPhone Shortcuts</Typography>
          <Typography variant="body2" color="text.secondary">Add expenses or income to Ledger directly from the Apple Shortcuts app.</Typography>
        </Box>
      </Stack>

      <Divider sx={{my:1.4}}/>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}} justifyContent="space-between">
        <Box>
          <Typography variant="caption" color="text.secondary">SHORTCUT ACCESS</Typography>
          <Stack direction="row" spacing={.75} alignItems="center" sx={{mt:.35}}>
            <Chip
              size="small"
              color={status?.configured?'primary':'default'}
              label={status?.configured?'Enabled':'Not configured'}
            />
            {status?.last_used_at&&<Typography variant="caption" color="text.secondary">
              Last used {new Date(status.last_used_at).toLocaleString('en-IN')}
            </Typography>}
          </Stack>
        </Box>
        <Stack direction="row" spacing={.75}>
          <Button
            variant={status?.configured?'outlined':'contained'}
            startIcon={status?.configured?<RestartAltRoundedIcon/>:<KeyRoundedIcon/>}
            onClick={generate}
            disabled={busy}
          >
            {status?.configured?'Rotate token':'Generate token'}
          </Button>
          {status?.configured&&<Button
            color="error"
            startIcon={<DeleteOutlineRoundedIcon/>}
            onClick={revoke}
            disabled={busy}
          >
            Revoke
          </Button>}
        </Stack>
      </Stack>

      {token&&<Alert severity="warning" sx={{mt:1.4}}>
        <Typography variant="body2" sx={{fontWeight:800}}>Copy this token now. Ledger will not show it again.</Typography>
        <Box sx={{mt:.75,p:1,bgcolor:'background.paper',borderRadius:1.5,overflowWrap:'anywhere',fontFamily:'monospace',fontSize:12}}>
          {token}
        </Box>
        <Button size="small" startIcon={<ContentCopyRoundedIcon/>} onClick={()=>copy(token,'Token')} sx={{mt:.5}}>Copy token</Button>
      </Alert>}

      {msg&&<Alert severity="success" sx={{mt:1.2}}>{msg}</Alert>}
      {error&&<Alert severity="error" sx={{mt:1.2}}>{error}</Alert>}
    </Paper>

    <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
      <Typography variant="h2">Shortcut endpoint</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
        Both Quick Expense and Quick Income use this HTTPS endpoint.
      </Typography>
      <Box sx={{mt:1,p:1.1,bgcolor:'action.hover',borderRadius:1.5,overflowWrap:'anywhere',fontFamily:'monospace',fontSize:12}}>
        {endpoint}
      </Box>
      <Button size="small" startIcon={<ContentCopyRoundedIcon/>} onClick={()=>copy(endpoint,'Endpoint')} sx={{mt:.5}}>Copy endpoint</Button>

      {status?.accounts?.length>0&&<>
        <Divider sx={{my:1.4}}/>
        <Typography variant="caption" color="text.secondary">VALID ACCOUNT NAMES</Typography>
        <Stack direction="row" gap={.6} sx={{mt:.65,flexWrap:'wrap'}}>
          {status.accounts.map((a:any)=><Chip key={a.name} size="small" label={a.name}/>)}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.65}}>
          If you omit account_name, Ledger records the shortcut transaction under Cash.
        </Typography>
      </>}
    </Paper>

    <Paper sx={{...clay,p:{xs:1.4,sm:2}}}>
      <Typography variant="h2">Build “Quick Expense” on iPhone</Typography>
      <Stack spacing={1} sx={{mt:1.1}}>
        {[
          'Open Shortcuts → tap + → New Shortcut.',
          'Add “Ask for Input”. Choose Number and name it Amount.',
          'Add another “Ask for Input”. Choose Text and name it Merchant.',
          'Add “Get Contents of URL” and paste the Ledger shortcut endpoint.',
          'Set Method to POST.',
          'Add a Header: Authorization = Bearer YOUR_LEDGER_TOKEN.',
          'Set Request Body to JSON.',
          'Add amount = Amount, direction = debit, merchant = Merchant.',
          'Optional: add account_name, category and note.',
          'Add “Show Result” after the request so Ledger confirms the transaction.',
        ].map((step,index)=><Stack key={step} direction="row" spacing={1} alignItems="flex-start">
          <Chip size="small" label={index+1} color="primary"/>
          <Typography variant="body2">{step}</Typography>
        </Stack>)}
      </Stack>

      <Divider sx={{my:1.5}}/>

      <Typography variant="h2">Quick Income</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.5}}>
        Duplicate the Quick Expense shortcut and change only <b>direction</b> from <b>debit</b> to <b>credit</b>. Incoming amounts recorded this way are included in Ledger Income.
      </Typography>
    </Paper>

    <Alert severity="info">
      The shortcut token is separate from your Ledger password and browser login. Revoke or rotate it immediately if the shortcut or token is shared accidentally.
    </Alert>
  </Stack>
}
