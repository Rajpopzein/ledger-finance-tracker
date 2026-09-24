import {useEffect,useState} from 'react'
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded'
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded'
import {api} from '../api/client'
import {useAppData} from '../appData'
import {claySx,useUI} from '../ui'
import SectionNav from '../components/SectionNav'

type SettingsTab='appearance'|'accounts'|'ai'|'privacy'

const templates=[
  {
    key:'balanced',
    name:'Balanced',
    description:'Equal emphasis on totals, cash flow, family and recent activity.',
    blocks:['wide','half','half','half','half']
  },
  {
    key:'focus',
    name:'Focus',
    description:'Large available balance and recent transactions first.',
    blocks:['wide','wide','third','third','third']
  },
  {
    key:'insights',
    name:'Insights',
    description:'Analytics-first layout with compact totals and wider breakdowns.',
    blocks:['third','third','third','wide','half','half']
  }
] as const

function TemplatePreview({blocks}:{blocks:readonly string[]}){
  return <Box sx={{
    display:'grid',
    gridTemplateColumns:'repeat(6,1fr)',
    gap:.6,
    height:86,
    mt:1.3,
  }}>
    {blocks.map((block,index)=><Box key={index} sx={{
      gridColumn:block==='wide'?'span 6':block==='half'?'span 3':'span 2',
      minWidth:0,
      borderRadius:1.5,
      bgcolor:index===0?'primary.main':'action.selected',
      opacity:index===0?1:.8,
    }}/>)}
  </Box>
}

export default function Settings({embedded=false}:{embedded?:boolean}){
  const {themeMode,dashboardTemplate,setThemeMode,setDashboardTemplate,savePreferences,loading:preferencesSaving,resolvedMode}=useUI()
  const {accounts,aiSettings,refreshAccounts,refreshAISettings}=useAppData()
  const [s,setS]=useState<any>({
    provider:'',base_url:'',model:'',api_key:'',context_limit:'',temperature:0.2,
    allow_amounts:true,allow_merchants:true,allow_categories:true,allow_dates:true,
    allow_balances:false,allow_notes:false
  })
  const [msg,setMsg]=useState('')
  const [acc,setAcc]=useState({institution:'',account_mask:'',name:''})
  const [prefMsg,setPrefMsg]=useState('')
  const [section,setSection]=useState<SettingsTab>('appearance')

  useEffect(()=>{
    setS((p:any)=>({...p,...aiSettings,provider:aiSettings.provider||'',api_key:''}))
  },[aiSettings])

  async function saveAI(){
    await api.saveAI({...s,context_limit:s.context_limit?Number(s.context_limit):null,provider:s.provider||null})
    await refreshAISettings()
    setMsg('AI settings saved.')
  }

  async function saveUI(){
    await savePreferences()
    setPrefMsg('Appearance and dashboard layout saved to your account.')
  }

  async function addAccount(){
    if(!acc.institution.trim())return
    await api.createAccount({...acc,type:'bank'})
    setAcc({institution:'',account_mask:'',name:''})
    await refreshAccounts()
  }

  const clay=claySx(resolvedMode)

  return <Stack spacing={embedded?2:2.5}>
    {!embedded&&<Box>
      <Typography variant="overline" color="text.secondary">CONFIGURATION</Typography>
      <Typography variant="h1">Settings</Typography>
      <Typography color="text.secondary" sx={{mt:.7}}>Personalize Ledger, manage your accounts and configure AI privacy.</Typography>
    </Box>}

    <SectionNav
      value={section}
      onChange={setSection}
      ariaLabel="Settings sections"
      items={[
        {value:'appearance',label:'Appearance'},
        {value:'accounts',label:'Accounts'},
        {value:'ai',label:'AI Provider'},
        {value:'privacy',label:'AI Privacy'},
      ]}
    />

    {section==='appearance'&&<><Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{mb:2}}>
        <DashboardCustomizeRoundedIcon color="primary"/>
        <Box>
          <Typography variant="h2">Appearance & dashboard</Typography>
          <Typography variant="body2" color="text.secondary">These preferences follow your Ledger account across devices.</Typography>
        </Box>
      </Stack>

      <Typography fontWeight={700} sx={{mb:1}}>Theme</Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={themeMode}
        onChange={(_,value)=>value&&setThemeMode(value)}
        sx={{mb:3,maxWidth:560}}
      >
        <ToggleButton value="light"><LightModeRoundedIcon sx={{mr:.8}}/>Light</ToggleButton>
        <ToggleButton value="dark"><DarkModeRoundedIcon sx={{mr:.8}}/>Dark</ToggleButton>
        <ToggleButton value="system"><SettingsBrightnessRoundedIcon sx={{mr:.8}}/>System</ToggleButton>
      </ToggleButtonGroup>

      <Typography fontWeight={700}>Dashboard template</Typography>
      <Box sx={{
        display:'grid',
        gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},
        gap:1.5,
        mt:1.2,
      }}>
        {templates.map(template=>{
          const active=dashboardTemplate===template.key
          return <Paper
            key={template.key}
            component="button"
            onClick={()=>setDashboardTemplate(template.key)}
            sx={{
              ...clay,
              p:1.8,
              border:active?'2px solid':'1px solid',
              borderColor:active?'primary.main':'divider',
              textAlign:'left',
              color:'text.primary',
              cursor:'pointer',
              width:'100%',
              transition:'transform .16s ease,border-color .16s ease',
              '&:hover':{transform:'translateY(-2px)',borderColor:'primary.main'},
            }}
          >
            <Typography fontWeight={800}>{template.name}</Typography>
            <Typography variant="caption" color="text.secondary">{template.description}</Typography>
            <TemplatePreview blocks={template.blocks}/>
          </Paper>
        })}
      </Box>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1.3} alignItems={{sm:'center'}} sx={{mt:2.2}}>
        <Button variant="contained" onClick={saveUI} disabled={preferencesSaving}>
          {preferencesSaving?'Saving…':'Save appearance'}
        </Button>
        {prefMsg&&<Alert severity="success" sx={{py:0}}>{prefMsg}</Alert>}
      </Stack>
    </Paper></>}

    {section==='accounts'&&<Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Typography variant="h2">Bank accounts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Only your own accounts are shown here.</Typography>

        <Stack spacing={1} sx={{mb:2}}>
          {accounts.filter(a=>a.type==='bank').map(a=><Box key={a.id} sx={{
            display:'flex',
            justifyContent:'space-between',
            gap:2,
            p:1.4,
            borderRadius:2.5,
            bgcolor:'action.hover',
          }}>
            <Typography fontWeight={700}>{a.name}</Typography>
            <Typography variant="body2" color="text.secondary">{a.institution}</Typography>
          </Box>)}
          {!accounts.filter(a=>a.type==='bank').length&&<Typography color="text.secondary">No bank accounts added yet.</Typography>}
        </Stack>

        <Stack spacing={1.4}>
          <TextField label="Bank / institution" value={acc.institution} placeholder="e.g. HDFC" onChange={e=>setAcc({...acc,institution:e.target.value})}/>
          <TextField label="Last 4 digits (optional)" value={acc.account_mask} inputProps={{maxLength:8,inputMode:'numeric'}} placeholder="1234" onChange={e=>setAcc({...acc,account_mask:e.target.value.replace(/\D/g,'')})}/>
          <TextField label="Display name (optional)" value={acc.name} placeholder="HDFC Salary" onChange={e=>setAcc({...acc,name:e.target.value})}/>
          <Button variant="contained" onClick={addAccount} disabled={!acc.institution.trim()}>Add bank account</Button>
        </Stack>
      </Paper>}

    {section==='ai'&&<Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
        <Typography variant="h2">AI provider</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Configuration and API keys are private to your user account.</Typography>

        <Stack spacing={1.4}>
          <FormControl size="small">
            <InputLabel>Provider</InputLabel>
            <Select label="Provider" value={s.provider} onChange={e=>setS({...s,provider:e.target.value})}>
              <MenuItem value="">Not configured</MenuItem>
              <MenuItem value="local">Local / OpenAI-compatible</MenuItem>
              <MenuItem value="gemini">Gemini</MenuItem>
            </Select>
          </FormControl>

          {s.provider==='local'&&<TextField label="Base URL" value={s.base_url||''} placeholder="http://localhost:1234/v1" onChange={e=>setS({...s,base_url:e.target.value})}/>}
          <TextField label="Model" value={s.model||''} placeholder="Enter model name" onChange={e=>setS({...s,model:e.target.value})}/>
          <TextField type="password" label="API key" value={s.api_key||''} placeholder={s.has_api_key?'Stored securely — enter to replace':'Optional for local; required for Gemini'} onChange={e=>setS({...s,api_key:e.target.value})}/>

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1.4}}>
            <TextField label="Context limit" value={s.context_limit||''} placeholder="16384" onChange={e=>setS({...s,context_limit:e.target.value})}/>
            <TextField label="Temperature" type="number" value={s.temperature} onChange={e=>setS({...s,temperature:Number(e.target.value)})}/>
          </Box>

          <Button variant="contained" onClick={saveAI}>Save AI settings</Button>
          {msg&&<Alert severity="success">{msg}</Alert>}
        </Stack>
      </Paper>}

    {section==='privacy'&&<Paper sx={{...clay,p:{xs:1.5,sm:2.25}}}>
      <Typography variant="h2">AI privacy</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Choose what calculated data may be sent to your configured model.</Typography>

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr',lg:'repeat(3,1fr)'},gap:.5}}>
        {[
          ['allow_amounts','Transaction amounts'],
          ['allow_merchants','Merchant names'],
          ['allow_categories','Categories'],
          ['allow_dates','Dates'],
          ['allow_balances','Account balances'],
          ['allow_notes','Notes']
        ].map(([k,l])=><FormControlLabel
          key={k}
          control={<Switch checked={!!s[k]} onChange={e=>setS({...s,[k]:e.target.checked})}/>}
          label={l}
        />)}
      </Box>

      <Alert severity="info" sx={{mt:1.5}}>
        Full account numbers, UPI IDs, bank/UTR references and raw statement files are never sent to cloud AI.
      </Alert>
    </Paper>}
  </Stack>
}
