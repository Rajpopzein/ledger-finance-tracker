import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  FormControlLabel,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Switch,
  Typography,
} from '@mui/material'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import {api} from '../api/client'
import {useFamily} from '../family'
import {claySx,useUI} from '../ui'
import Settings from './Settings'
import ShortcutsSetup from '../components/ShortcutsSetup'
import SectionNav from '../components/SectionNav'

type ProfileTab='account'|'family'|'shortcuts'|'settings'

export default function Profile(){
  const {linkedUsers,incoming,outgoing,refreshFamily}=useFamily()
  const {resolvedMode}=useUI()
  const [searchParams,setSearchParams]=useSearchParams()
  const rawTab=searchParams.get('tab')
  const tab:ProfileTab=rawTab==='family'||rawTab==='shortcuts'||rawTab==='settings'?rawTab:'account'

  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({name:'',phone:''})
  const [linkHandle,setLinkHandle]=useState('')
  const [linkLabel,setLinkLabel]=useState('')
  const [msg,setMsg]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [sharingBusy,setSharingBusy]=useState<number|null>(null)

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

  async function updateSharing(
    user:any,
    key:'transactions'|'debts'|'investments'|'ai_insights'|'ai_categorization',
    value:boolean,
  ){
    const next={...user.sharing,[key]:value}
    setSharingBusy(user.link_id)
    setError('')
    setMsg('')
    try{
      await api.updateFamilySharing(user.link_id,next)
      await refreshFamily()
      setMsg('Family sharing updated.')
    }catch(e:any){
      setError(e.message||'Could not update family sharing.')
    }finally{
      setSharingBusy(null)
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

    <SectionNav
      value={tab}
      onChange={value=>setSearchParams({tab:value})}
      ariaLabel="Profile sections"
      items={[
        {value:'account',label:'Account'},
        {value:'family',label:'Family'},
        {value:'shortcuts',label:'Shortcuts'},
        {value:'settings',label:'Settings'},
      ]}
    />

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
          helperText="System generated. This ID cannot be changed."
          InputProps={{
            readOnly:true,
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

        {outgoing.length>0&&<Stack spacing={0.75} sx={{mt:2}}>
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
        <Stack spacing={0.75}>
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
            <Stack direction="row" spacing={0.75}>
              <Button size="small" disabled={busy} onClick={()=>act(item.link_id,'reject')}>Reject</Button>
              <Button size="small" variant="contained" disabled={busy} onClick={()=>act(item.link_id,'accept')}>Accept</Button>
            </Stack>
          </Box>)}
        </Stack>
      </Paper>}

      <Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={.75} sx={{mb:1.25}}>
          <Box>
            <Typography variant="h2">Family sharing</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mt:.35}}>
              Choose what each connected family member can view. Sharing is read-only and never grants edit or delete access.
            </Typography>
          </Box>
          <Chip size="small" label={linkedUsers.length}/>
        </Stack>

        <Stack spacing={1}>
          {linkedUsers.map(user=>{
            const sharedBack=[
              user.shared_with_me.transactions&&'Transactions',
              user.shared_with_me.debts&&'Debts & cards',
              user.shared_with_me.investments&&'Investments',
              user.shared_with_me.ai_insights&&'AI Insights',
              user.shared_with_me.ai_categorization&&'AI Categorization',
            ].filter(Boolean) as string[]
            return <Box
              key={user.id}
              sx={{
                p:{xs:1.2,sm:1.5},
                bgcolor:'action.hover',
                borderRadius:2,
                minWidth:0,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{minWidth:0}}>
                  <Typography variant="body1" sx={{fontWeight:800}} noWrap>{user.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.handle}{user.label?' · '+user.label:''}
                  </Typography>
                </Box>
                <Button size="small" color="error" disabled={busy||sharingBusy===user.link_id} onClick={()=>remove(user.link_id)}>
                  Remove
                </Button>
              </Stack>

              <Box sx={{
                display:'grid',
                gridTemplateColumns:{xs:'1fr',md:'1.25fr .75fr'},
                gap:{xs:1,md:2},
                mt:1.25,
              }}>
                <Box>
                  <Typography variant="overline" color="text.secondary">WHAT I SHARE</Typography>
                  <Stack direction={{xs:'column',sm:'row'}} spacing={{xs:0,sm:1.5}} sx={{mt:.25,flexWrap:'wrap'}}>
                    <FormControlLabel
                      control={<Switch
                        size="small"
                        checked={!!user.sharing.transactions}
                        disabled={sharingBusy===user.link_id}
                        onChange={e=>updateSharing(user,'transactions',e.target.checked)}
                      />}
                      label="Transactions"
                    />
                    <FormControlLabel
                      control={<Switch
                        size="small"
                        checked={!!user.sharing.debts}
                        disabled={sharingBusy===user.link_id}
                        onChange={e=>updateSharing(user,'debts',e.target.checked)}
                      />}
                      label="Debts & cards"
                    />
                    <FormControlLabel
                      control={<Switch
                        size="small"
                        checked={!!user.sharing.investments}
                        disabled={sharingBusy===user.link_id}
                        onChange={e=>updateSharing(user,'investments',e.target.checked)}
                      />}
                      label="Investments"
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    These permissions control family-scoped dashboard totals and shared transaction visibility.
                  </Typography>

                  <Typography variant="overline" color="text.secondary" sx={{display:'block',mt:1.25}}>AI ACCESS</Typography>
                  <Stack direction={{xs:'column',sm:'row'}} spacing={{xs:0,sm:1.5}} sx={{mt:.25,flexWrap:'wrap'}}>
                    <FormControlLabel
                      control={<Switch
                        size="small"
                        checked={!!user.sharing.ai_insights}
                        disabled={sharingBusy===user.link_id}
                        onChange={e=>updateSharing(user,'ai_insights',e.target.checked)}
                      />}
                      label="AI Insights"
                    />
                    <FormControlLabel
                      control={<Switch
                        size="small"
                        checked={!!user.sharing.ai_categorization}
                        disabled={sharingBusy===user.link_id}
                        onChange={e=>updateSharing(user,'ai_categorization',e.target.checked)}
                      />}
                      label="AI Categorization"
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    AI access shares capability only. Provider credentials and AI history stay private.
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="text.secondary">SHARED WITH ME</Typography>
                  <Stack direction="row" gap={.6} sx={{mt:.7,flexWrap:'wrap'}}>
                    {sharedBack.map(label=><Chip key={label} size="small" variant="outlined" label={label}/>)}
                    {!sharedBack.length&&<Typography variant="caption" color="text.secondary">Nothing shared with you.</Typography>}
                  </Stack>
                </Box>
              </Box>
            </Box>
          })}
          {!linkedUsers.length&&<Typography variant="body2" color="text.secondary">No linked family members yet.</Typography>}
        </Stack>
      </Paper>
    </Stack>}

    {tab==='shortcuts'&&<ShortcutsSetup/>}
    {tab==='settings'&&<Settings embedded/>}
  </Stack>
}
