import {useEffect,useState} from 'react'
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom'
import {
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Divider,
  Drawer,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import {PeriodProvider,usePeriod} from '../period'
import {FamilyProvider,useFamily} from '../family'
import {api} from '../api/client'
import {claySx,useUI} from '../ui'

const drawerWidth=248

const nav=[
  {to:'/',label:'Overview',icon:<DashboardRoundedIcon/>},
  {to:'/transactions',label:'Transactions',icon:<ReceiptLongRoundedIcon/>},
  {to:'/import',label:'Import',icon:<UploadFileRoundedIcon/>},
  {to:'/ai',label:'AI Insights',icon:<AutoAwesomeRoundedIcon/>},
  {to:'/profile',label:'Profile',icon:<PersonRoundedIcon/>},
  {to:'/settings',label:'Settings',icon:<SettingsRoundedIcon/>},
]

function Shell(){
  const {period,setPeriodKey,options}=usePeriod()
  const {scopeKey,setScopeKey,linkedUsers,scopeLabel}=useFamily()
  const {resolvedMode}=useUI()
  const [auth,setAuth]=useState<any>(null)
  const theme=useTheme()
  const desktop=useMediaQuery(theme.breakpoints.up('md'))
  const location=useLocation()
  const navigate=useNavigate()

  useEffect(()=>{api.authStatus().then(setAuth).catch(()=>setAuth(null))},[])

  const profileName=auth?.name||'User'
  const profileHandle=auth?.handle||''
  const profileInitial=(profileName?.[0]||'U').toUpperCase()

  async function signOut(){
    try{await api.logout()}finally{window.location.replace('/')}
  }

  const drawer=<Box sx={{
    height:'100%',
    display:'flex',
    flexDirection:'column',
    p:2,
    bgcolor:'background.default',
  }}>
    <Box sx={{...claySx(resolvedMode),p:2.2,mb:2.5}}>
      <Stack direction="row" alignItems="center" spacing={1.3}>
        <Avatar sx={{bgcolor:'primary.main',color:resolvedMode==='dark'?'#063426':'#fff',fontWeight:800}}>₹</Avatar>
        <Box>
          <Typography fontWeight={800} letterSpacing=".08em">LEDGER</Typography>
          <Typography variant="caption" color="text.secondary">Personal finance</Typography>
        </Box>
      </Stack>
    </Box>

    <Stack spacing={.6}>
      {nav.map(item=><Box
        key={item.to}
        component={NavLink}
        to={item.to}
        sx={{
          display:'flex',
          alignItems:'center',
          gap:1.2,
          px:1.5,
          py:1.15,
          borderRadius:3,
          color:location.pathname===item.to?'primary.main':'text.secondary',
          bgcolor:location.pathname===item.to?'action.selected':'transparent',
          textDecoration:'none',
          fontWeight:700,
          transition:'all .18s ease',
          '&:hover':{bgcolor:'action.hover',color:'text.primary'},
          '& svg':{fontSize:21}
        }}
      >
        {item.icon}<span>{item.label}</span>
      </Box>)}
    </Stack>

    <Box sx={{flex:1}}/>
    <Divider sx={{my:2}}/>

    <Stack direction="row" alignItems="center" spacing={1.2} sx={{minWidth:0}}>
      <Avatar sx={{bgcolor:'secondary.main'}}>{profileInitial}</Avatar>
      <Box sx={{minWidth:0,flex:1}}>
        <Typography fontWeight={700} noWrap>{profileName}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{profileHandle||'Private ledger'}</Typography>
      </Box>
      <Box
        component="button"
        onClick={signOut}
        aria-label="Sign out"
        sx={{
          border:0,
          bgcolor:'transparent',
          color:'text.secondary',
          cursor:'pointer',
          p:.7,
          borderRadius:2,
          '&:hover':{bgcolor:'action.hover',color:'text.primary'}
        }}
      >
        <LogoutRoundedIcon fontSize="small"/>
      </Box>
    </Stack>
  </Box>

  return <Box sx={{minHeight:'100dvh',bgcolor:'background.default'}}>
    {desktop&&<Drawer
      variant="permanent"
      sx={{
        width:drawerWidth,
        flexShrink:0,
        '& .MuiDrawer-paper':{
          width:drawerWidth,
          borderRight:'1px solid',
          borderColor:'divider',
          bgcolor:'background.default',
        }
      }}
    >{drawer}</Drawer>}

    <Box sx={{
      ml:{md:`${drawerWidth}px`},
      minWidth:0,
      pb:{xs:10,md:0},
    }}>
      <Box
        component="header"
        sx={{
          position:'sticky',
          top:0,
          zIndex:20,
          px:{xs:1.5,sm:2.5,lg:4},
          py:1.4,
          bgcolor:resolvedMode==='dark'?'rgba(11,14,18,.82)':'rgba(239,243,241,.82)',
          backdropFilter:'blur(18px)',
          borderBottom:'1px solid',
          borderColor:'divider',
        }}
      >
        <Stack
          direction={{xs:'column',sm:'row'}}
          spacing={1.2}
          alignItems={{xs:'stretch',sm:'center'}}
          justifyContent="space-between"
        >
          <Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{minWidth:0}}>
            <FormControl size="small" sx={{minWidth:{sm:150}}}>
              <Select
                value={period.key}
                onChange={e=>setPeriodKey(e.target.value as typeof period.key)}
                aria-label="Select period"
              >
                {options.map(o=><MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{minWidth:{sm:190}}}>
              <Select
                value={scopeKey}
                onChange={e=>setScopeKey(String(e.target.value))}
                aria-label="Select family scope"
              >
                <MenuItem value="self">Self</MenuItem>
                <MenuItem value="family">Family</MenuItem>
                <MenuItem value="all">Self + Family</MenuItem>
                {linkedUsers.map(user=><MenuItem key={user.id} value={`user:${user.id}`}>{user.name} · {user.handle}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{textAlign:{xs:'left',sm:'right'}}}>
            {period.rangeLabel} · {scopeLabel}
          </Typography>
        </Stack>
      </Box>

      <Box component="main" sx={{
        width:'100%',
        maxWidth:1600,
        mx:'auto',
        p:{xs:1.5,sm:2.5,lg:4},
      }}>
        <Outlet/>
      </Box>
    </Box>

    {!desktop&&<BottomNavigation
      showLabels
      value={nav.findIndex(x=>x.to===location.pathname)}
      onChange={(_,index)=>navigate(nav[index].to)}
      sx={{
        position:'fixed',
        left:8,
        right:8,
        bottom:8,
        zIndex:30,
        height:66,
        ...claySx(resolvedMode),
        borderRadius:4,
        overflow:'hidden',
        '& .MuiBottomNavigationAction-root':{minWidth:0,p:.5},
        '& .MuiBottomNavigationAction-label':{fontSize:'.63rem'},
      }}
    >
      {nav.map(item=><BottomNavigationAction key={item.to} label={item.label.split(' ')[0]} icon={item.icon}/>)}
    </BottomNavigation>}
  </Box>
}

export default function Layout(){
  return <FamilyProvider><PeriodProvider><Shell/></PeriodProvider></FamilyProvider>
}
