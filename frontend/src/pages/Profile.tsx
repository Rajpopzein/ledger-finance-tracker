import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import {api} from '../api/client'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'
import Settings from './Settings'

type ProfileTab='account'|'family'|'settings'

export default function Profile(){
  const {linkedUsers,incoming,outgoing,refreshFamily}=useFamily()
  const {resolvedMode}=useUI()
  const [searchParams,setSearchParams]=useSearchParams()
  const rawTab=searchParams.get('tab')
  const tab:ProfileTab=rawTab==='family'||rawTab==='settings'?rawTab:'account'

  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({name:'',phone:''})
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
      phone:p.phone||''
    })
  }

  useEffect(()=>{
    loadProfile().catch((e:any)=>setError(e.message||'Could not load profile.'))
    refreshFamily()
  },[])

  async function saveProfile(){
    if(!profile)return
    setBusy(true);setError('');setMsg('')
    try{
      const p=await api.updateProfile({
        name:form.name.trim(),
        handle:profile.handle_raw||String(profile.handle||'').replace(/^@/,''),
        phone:form.phone.trim()||null
      })
      setProfile(p)
      setForm({name:p.name||'',phone:p.phone||''})
      setMsg('Profile updated.')
    }catch(e:any){
      setError(e.message||'Could not update profile.')
    }finally{
      setBusy(false)
    }
  }

  async function copyId(){
    if(!profile?.handle)return
    try{
      await navigator.clipboard.writeText(profile.handle)
      setMsg('Ledger ID copied.')
    }catch{
      setMsg('Ledger ID: '+profile.handle)
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

  if(!profile)return <Stack spacing={1.25}>{[1,2].map(i=><Paper key={i} sx={{height:96,borderRadius:2.25}}/>)}</Stack>

  const clay=claySx(resolvedMode)

  return <Stack spacing={1.75}>
    <Box>
      <Typography variant="overline" color="text.secondary">YOUR ACCOUNT</Typography>
      <Typography variant="h1">Profile</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mt:.45}}>
        Manage your account, family connections and settings.
      </Typography>
    </Box>

    <Paper sx={{...clay,p:.5,overflow:'hidden'}}>
      <Tabs
        value={tab}
        onChange={(_,value)=>setSearchParams({tab:value})}
        variant="fullWidth"
        aria-label="Profile sections"
        sx={{
          minHeight:44,
          '& .MuiTab-root':{
            minHeight:44,
            px:{xs:.75,sm:1.5},
            fontSize:{xs:12,sm:13},
          }
        }}
      >
        <Tab value="account" label="Account"/>
        <Tab value="family" label="Family"/>
        <Tab value="settings" label="Settings"/>
      </Tabs>
    </Paper>

    {error&&<Alert severity="error">{error}</Alert>}
    {msg&&<Alert severity="success">{msg}</Alert>}

    {tab==='account'&&<Paper sx={{...clay,p:{xs:1.5,sm:2.25},maxWidth:760}}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{mb:2}}>
        <Avatar sx={{width:50,height:50,bgcolor:'primary.main',fontSize:'1.15rem',fontWeight:800}}>
          {(form.name?.[0]||'U').toUpperCase()}
        </Avatar>
        <Box sx={{minWidth:0}}>
          <Typography variant="h2" noWrap>{form.name||'User'}</Typography>
          <Typography variant="body2" color="primary.main" sx={{fontWeight:800}}>{profile.handle}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{display:'block',overflowWrap:'anywhere'}}>{profile.email}</Typography>
        </Box>
      </Stack>

      <Stack spacing={1.35}>
        <TextField
          label="Name"
          value={form.name}
          inputProps={{maxLength:100}}
          onChange={e=>setForm({...form,name:e.target.value})}
        />

        <TextField
          label="Ledger ID"
          value={profile.handle||''}
          disabled
          helperText="System generated. This ID cannot be changed."
          InputProps={{
            endAdornment:<InputAdornment position="end">
              <Button size="small" onClick={copyId} startIcon={<ContentCopyRoundedIcon fontSize="small"/>}>Copy</Button>
            </InputAdornment>
          }}
        />

        <TextField label="Email" value={profile.email||''} disabled/>

        <TextField
          label="Phone (optional)"
          value={form.phone}
          placeholder="+91…"
          onChange={e=>setForm({...form,phone:e.target.value})}
        />

        <Button
          variant="contained"
          disabled={busy||!form.name.trim()}
          onClick={saveProfile}
          sx={{alignSelf:{sm:'flex-start'},minWidth:{sm:150}}}
        >
          {busy?'Saving…':'Save profile'}
        </Button>
      </Stack>
    </Paper>}

    {tab==='family'&&<Stack spacing={1.5}>
      <Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{mb:.75}}>
          <PersonAddAlt1RoundedIcon color="primary" fontSize="small"/>
          <Typography variant="h2">Link family</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>
          Enter another Ledger user's system ID to send a family invitation.
        </Typography>

        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1.25}}>
          <TextField
            label="Ledger ID"
            value={linkHandle.replace(/^@/,'')}
            InputProps={{startAdornment:<InputAdornment position="start">@</InputAdornment>}}
            onChange={e=>setLinkHandle(e.target.value.toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_]/g,''))}
          />
          <TextField
            label="Relationship (optional)"
            value={linkLabel}
            placeholder="e.g. Wife, Father"
            onChange={e=>setLinkLabel(e.target.value)}
          />
        </Box>
        <Button
          variant="contained"
          disabled={busy||linkHandle.length<3}
          onClick={invite}
          sx={{mt:1.25}}
        >
          Send invite
        </Button>

        {outgoing.length>0&&<Stack spacing=.75 sx={{mt:2}}>
          <Typography variant="overline" color="text.secondary">PENDING SENT</Typography>
          {outgoing.map((item:any)=><Box
            key={item.link_id}
            sx={{
              p:1.1,
              bgcolor:'action.hover',
              borderRadius:1.75,
              display:'flex',
              alignItems:'center',
              justifyContent:'space-between',
              gap:1
            }}
          >
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" sx={{fontWeight:700}} noWrap>{item.user.name}</Typography>
              <Typography variant="caption" color="text.secondary">{item.user.handle}</Typography>
            </Box>
            <Chip size="small" label="Pending"/>
          </Box>)}
        </Stack>}
      </Paper>

      {incoming.length>0&&<Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
          <Typography variant="h2">Invitations</Typography>
          <Chip size="small" label={incoming.length} color="primary"/>
        </Stack>
        <Stack spacing=.75>
          {incoming.map((item:any)=><Box
            key={item.link_id}
            sx={{
              p:1.1,
              bgcolor:'action.hover',
              borderRadius:1.75,
              display:'flex',
              flexDirection:{xs:'column',sm:'row'},
              alignItems:{sm:'center'},
              justifyContent:'space-between',
              gap:1
            }}
          >
            <Box>
              <Typography variant="body2" sx={{fontWeight:700}}>{item.user.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.user.handle+(item.label?' · '+item.label:'')}
              </Typography>
            </Box>
            <Stack direction="row" spacing=.75>
              <Button size="small" disabled={busy} onClick={()=>act(item.link_id,'reject')}>Reject</Button>
              <Button size="small" variant="contained" disabled={busy} onClick={()=>act(item.link_id,'accept')}>Accept</Button>
            </Stack>
          </Box>)}
        </Stack>
      </Paper>}

      <Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
          <Typography variant="h2">Connected family</Typography>
          <Chip size="small" label={linkedUsers.length}/>
        </Stack>
        <Stack spacing=.75>
          {linkedUsers.map(user=><Box
            key={user.id}
            sx={{
              p:1.1,
              bgcolor:'action.hover',
              borderRadius:1.75,
              display:'flex',
              alignItems:'center',
              justifyContent:'space-between',
              gap:1,
              minWidth:0
            }}
          >
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" sx={{fontWeight:700}} noWrap>{user.name}</Typography>
              <Typography variant="caption" color="text.secondary">{user.handle}{user.label?' · '+user.label:''}</Typography>
            </Box>
            <Button size="small" color="error" disabled={busy} onClick={()=>remove(user.link_id)}>Remove</Button>
          </Box>)}
          {!linkedUsers.length&&<Typography variant="body2" color="text.secondary">No linked family members yet.</Typography>}
        </Stack>
      </Paper>
    </Stack>}

    {tab==='settings'&&<Settings embedded/>}
  </Stack>
}
