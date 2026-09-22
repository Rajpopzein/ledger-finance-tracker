import {useEffect,useState} from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import {api} from '../api/client'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'

export default function Profile(){
  const {linkedUsers,incoming,outgoing,refreshFamily}=useFamily()
  const {resolvedMode}=useUI()
  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({name:'',handle:'',phone:''})
  const [linkHandle,setLinkHandle]=useState('')
  const [linkLabel,setLinkLabel]=useState('')
  const [msg,setMsg]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function loadProfile(){
    const p=await api.profile()
    setProfile(p)
    setForm({
      name:p.name||'',
      handle:p.handle_raw||String(p.handle||'').replace(/^@/,''),
      phone:p.phone||''
    })
  }

  useEffect(()=>{
    loadProfile().catch((e:any)=>setError(e.message||'Could not load profile.'))
    refreshFamily()
  },[])

  async function saveProfile(){
    setBusy(true);setError('');setMsg('')
    try{
      const p=await api.updateProfile({
        name:form.name.trim(),
        handle:form.handle.trim(),
        phone:form.phone.trim()||null
      })
      setProfile(p)
      setForm({
        name:p.name||'',
        handle:p.handle_raw||String(p.handle||'').replace(/^@/,''),
        phone:p.phone||''
      })
      setMsg('Profile updated.')
    }catch(e:any){
      setError(e.message||'Could not update profile.')
    }finally{
      setBusy(false)
    }
  }

  async function invite(){
    if(!linkHandle.trim())return
    setBusy(true);setError('');setMsg('')
    try{
      const result=await api.linkFamily(linkHandle.trim(),linkLabel.trim())
      setLinkHandle('')
      setLinkLabel('')
      setMsg('Invitation sent to '+result.user.handle+'.')
      await refreshFamily()
    }catch(e:any){
      setError(e.message||'Could not send family invitation.')
    }finally{
      setBusy(false)
    }
  }

  async function act(linkId:number,action:'accept'|'reject'){
    setBusy(true);setError('');setMsg('')
    try{
      await api.familyLinkAction(linkId,action)
      setMsg(action==='accept'?'Family invitation accepted.':'Family invitation rejected.')
      await refreshFamily()
    }catch(e:any){
      setError(e.message||'Could not update family invitation.')
    }finally{
      setBusy(false)
    }
  }

  async function remove(linkId:number){
    setBusy(true);setError('');setMsg('')
    try{
      await api.removeFamilyLink(linkId)
      setMsg('Family link removed.')
      await refreshFamily()
    }catch(e:any){
      setError(e.message||'Could not remove family link.')
    }finally{
      setBusy(false)
    }
  }

  if(!profile)return <Stack spacing={1.5}>{[1,2,3].map(i=><Paper key={i} sx={{height:100,borderRadius:4}}/>)}</Stack>

  const clay=claySx(resolvedMode)

  return <Stack spacing={2.2}>
    <Box>
      <Typography variant="overline" color="text.secondary">YOUR ACCOUNT</Typography>
      <Typography variant="h1">Profile</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>Your @handle is how other Ledger users find you for family linking.</Typography>
    </Box>

    {error&&<Alert severity="error">{error}</Alert>}
    {msg&&<Alert severity="success">{msg}</Alert>}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:2}}>
      <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{mb:2.2}}>
          <Avatar sx={{width:58,height:58,bgcolor:'primary.main',fontSize:'1.4rem',fontWeight:800}}>{(form.name?.[0]||'U').toUpperCase()}</Avatar>
          <Box sx={{minWidth:0}}>
            <Typography variant="h2" noWrap>{form.name||'User'}</Typography>
            <Typography color="primary.main" fontWeight={800}>@{form.handle||'handle'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{profile.email}</Typography>
          </Box>
        </Stack>

        <Stack spacing={1.5}>
          <TextField label="Name" value={form.name} inputProps={{maxLength:100}} onChange={e=>setForm({...form,name:e.target.value})}/>
          <TextField
            label="Ledger ID / Handle"
            value={form.handle}
            inputProps={{maxLength:40}}
            InputProps={{startAdornment:<InputAdornment position="start">@</InputAdornment>}}
            onChange={e=>setForm({...form,handle:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}
            helperText="3–40 characters. Letters, numbers and underscore only."
          />
          <TextField label="Email" value={profile.email||''} disabled/>
          <TextField label="Phone (optional)" value={form.phone} placeholder="+91…" onChange={e=>setForm({...form,phone:e.target.value})}/>
          <Button variant="contained" disabled={busy||!form.name.trim()||form.handle.length<3} onClick={saveProfile}>
            {busy?'Saving…':'Save profile'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{mb:1}}>
          <PersonAddAlt1RoundedIcon color="primary"/>
          <Typography variant="h2">Link family</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Each person creates their own Ledger account first. Link them by @handle.</Typography>

        <Stack spacing={1.5}>
          <TextField
            label="User handle"
            value={linkHandle.replace(/^@/,'')}
            InputProps={{startAdornment:<InputAdornment position="start">@</InputAdornment>}}
            onChange={e=>setLinkHandle(e.target.value.toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_]/g,''))}
          />
          <TextField label="Relationship label (optional)" value={linkLabel} placeholder="e.g. Wife, Father" onChange={e=>setLinkLabel(e.target.value)}/>
          <Button variant="contained" disabled={busy||linkHandle.length<3} onClick={invite}>Send family invite</Button>
        </Stack>

        {outgoing.length>0&&<Stack spacing={1} sx={{mt:2.5}}>
          <Typography variant="overline" color="text.secondary">PENDING SENT</Typography>
          {outgoing.map((item:any)=><Stack key={item.link_id} direction="row" justifyContent="space-between" alignItems="center" sx={{p:1.2,bgcolor:'action.hover',borderRadius:2.5}}>
            <Box><Typography fontWeight={700}>{item.user.name}</Typography><Typography variant="caption" color="text.secondary">{item.user.handle}</Typography></Box>
            <Chip size="small" label="Pending"/>
          </Stack>)}
        </Stack>}
      </Paper>
    </Box>

    {incoming.length>0&&<Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
        <Typography variant="h2">Family invitations</Typography>
        <Chip label={incoming.length} color="primary"/>
      </Stack>
      <Stack spacing={1}>
        {incoming.map((item:any)=><Stack key={item.link_id} direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1.2} sx={{p:1.4,bgcolor:'action.hover',borderRadius:2.5}}>
          <Box><Typography fontWeight={700}>{item.user.name}</Typography><Typography variant="caption" color="text.secondary">{item.user.handle+(item.label?' · '+item.label:'')}</Typography></Box>
          <Stack direction="row" spacing={1}>
            <Button disabled={busy} onClick={()=>act(item.link_id,'reject')}>Reject</Button>
            <Button variant="contained" disabled={busy} onClick={()=>act(item.link_id,'accept')}>Accept</Button>
          </Stack>
        </Stack>)}
      </Stack>
    </Paper>}

    <Paper sx={{...clay,p:{xs:2,sm:2.5}}}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
        <Box><Typography variant="overline" color="text.secondary">CONNECTED USERS</Typography><Typography variant="h2">Family</Typography></Box>
        <Chip label={linkedUsers.length}/>
      </Stack>

      <Stack spacing={1}>
        {linkedUsers.map(user=><Stack key={user.id} direction="row" justifyContent="space-between" alignItems="center" spacing={1.2} sx={{p:1.3,bgcolor:'action.hover',borderRadius:2.5,minWidth:0}}>
          <Box sx={{minWidth:0}}><Typography fontWeight={700} noWrap>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.handle}{user.label?' · '+user.label:''}</Typography></Box>
          <Button color="error" disabled={busy} onClick={()=>remove(user.link_id)}>Remove</Button>
        </Stack>)}
        {!linkedUsers.length&&<Typography color="text.secondary">No linked family members yet.</Typography>}
      </Stack>
    </Paper>
  </Stack>
}
