import {FormEvent,useState} from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

function generateLedgerId(name:string){
  const base=name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)||'user'
  const buffer=new Uint32Array(1)
  crypto.getRandomValues(buffer)
  const suffix=String(buffer[0]%100000).padStart(5,'0')
  return (base+suffix).slice(0,40)
}

export default function Auth({setupRequired,onAuthenticated}:{setupRequired:boolean;onAuthenticated:()=>void}){
  const {resolvedMode}=useUI()
  const [mode,setMode]=useState<'login'|'signup'>(setupRequired?'signup':'login')
  const [name,setName]=useState('')
  const [handle,setHandle]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  const signup=mode==='signup'

  function switchMode(next:'login'|'signup'){
    setMode(next)
    setError('')
    setPassword('')
    setConfirm('')
    if(next==='signup')setHandle(name.trim()?generateLedgerId(name):'')
  }

  async function submit(e:FormEvent){
    e.preventDefault()
    setError('')

    if(signup){
      if(!name.trim())return setError('Enter your name.')
      if(handle.trim().length<3)return setError('Ledger ID could not be generated. Re-enter your name.')
      if(password!==confirm)return setError('Passwords do not match.')
      if(password.length<12)return setError('Use at least 12 characters.')
    }

    setBusy(true)
    try{
      const signupHandle=signup?(handle.trim()||generateLedgerId(name)):''
      if(signup){
        setHandle(signupHandle)
        await api.signup(name.trim(),signupHandle,email,password)
      }
      await api.login(email,password)
      onAuthenticated()
    }catch(err:any){
      const message=err.message||'Authentication failed'
      if(signup&&String(message).toLowerCase().includes('handle')){
        const nextId=generateLedgerId(name)
        setHandle(nextId)
        setError('A generated Ledger ID collision occurred. A new ID is ready; submit again.')
      }else{
        setError(message)
      }
    }finally{
      setBusy(false)
    }
  }

  return <Box sx={{
    minHeight:'100dvh',
    display:'grid',
    placeItems:'center',
    bgcolor:'background.default',
    p:2,
  }}>
    <Paper sx={{...claySx(resolvedMode),width:'100%',maxWidth:440,p:{xs:1.6,sm:2.5}}}>
      <Stack direction="row" alignItems="center" spacing={1.2} sx={{mb:2}}>
        <Avatar sx={{bgcolor:'primary.main',fontWeight:850}}>₹</Avatar>
        <Box>
          <Typography fontWeight={850} letterSpacing=".08em">LEDGER</Typography>
          <Typography variant="caption" color="text.secondary">Private personal finance</Typography>
        </Box>
      </Stack>

      <Tabs
        value={mode}
        onChange={(_,value)=>switchMode(value)}
        variant="fullWidth"
        sx={{mb:2.5}}
      >
        <Tab value="login" label="Sign in"/>
        <Tab value="signup" label="Sign up"/>
      </Tabs>

      <Typography variant="overline" color="text.secondary">{signup?'CREATE ACCOUNT':'PRIVATE ACCESS'}</Typography>
      <Typography variant="h1" sx={{fontSize:'clamp(1.7rem,7vw,2.4rem)'}}>{signup?'Create your Ledger account':'Sign in'}</Typography>
      <Typography color="text.secondary" sx={{mt:.8,mb:2.2}}>
        {signup?'Create your account first. Ledger generates a permanent ID for family linking.':'Use your personal Ledger account.'}
      </Typography>

      <Box component="form" onSubmit={submit}>
        <Stack spacing={1.5}>
          {signup&&<TextField
            label="Name"
            value={name}
            autoComplete="name"
            required
            inputProps={{maxLength:100}}
            onChange={e=>{
              const next=e.target.value
              setName(next)
              if(!handle&&next.trim())setHandle(generateLedgerId(next))
            }}
          />}

          {signup&&<TextField
            label="Ledger ID"
            value={handle?'@'+handle:''}
            disabled
            placeholder="Generated after you enter your name"
            helperText="System generated and cannot be changed from the app."
          />}

          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={e=>setEmail(e.target.value)}
          />

          <TextField
            label="Password"
            type="password"
            autoComplete={signup?'new-password':'current-password'}
            required
            value={password}
            onChange={e=>setPassword(e.target.value)}
          />

          {signup&&<TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e=>setConfirm(e.target.value)}
          />}

          {error&&<Alert severity="error">{error}</Alert>}

          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy?'Please wait…':signup?'Create account':'Sign in'}
          </Button>

          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{p:1.15,bgcolor:'action.hover',borderRadius:1.75}}>
            <LockRoundedIcon color="primary" fontSize="small"/>
            <Typography variant="caption" color="text.secondary">
              Independent account. Family linking never shares your password or merges your login.
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  </Box>
}
