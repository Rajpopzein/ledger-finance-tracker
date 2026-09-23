import {useState} from 'react'
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom'
import {
  Avatar,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded'
import {PeriodProvider,usePeriod} from '../period'
import {FamilyProvider,useFamily} from '../family'
import {api} from '../api/client'
import {useAppData} from '../appData'
import {claySx,useUI} from '../ui'

const drawerWidth=256

const nav=[
  {to:'/',label:'Overview',icon:<DashboardRoundedIcon/>},
  {to:'/transactions',label:'Transactions',icon:<ReceiptLongRoundedIcon/>},
  {to:'/debts',label:'Debts',icon:<AccountBalanceRoundedIcon/>},
  {to:'/investments',label:'Investments',icon:<ShowChartRoundedIcon/>},
  {to:'/import',label:'Import',icon:<UploadFileRoundedIcon/>},
  {to:'/ai',label:'AI Insights',icon:<AutoAwesomeRoundedIcon/>},
  {to:'/profile',label:'Profile & Settings',icon:<PersonRoundedIcon/>},
]

function Shell(){
  const {period,setPeriodKey,options}=usePeriod()
  const {scopeKey,setScopeKey,linkedUsers,scopeLabel}=useFamily()
  const {resolvedMode}=useUI()
  const {auth}=useAppData()
  const theme=useTheme()
  const desktop=useMediaQuery(theme.breakpoints.up('md'))
  const nativeApp=typeof window!=='undefined'&&((window as any).__TAURI_INTERNALS__!=null||window.location.hostname==='tauri.localhost')
  const location=useLocation()
  const navigate=useNavigate()


  const profileName=auth?.name||'User'
  const profileHandle=auth?.handle||''

  async function signOut(){
    try{await api.logout()}finally{window.location.replace('/')}
  }

  const drawer=<Box sx={{
    height:'100%',
    display:'flex',
    flexDirection:'column',
    px:'calc(14px + var(--safe-area-left))',
    pr:'calc(14px + var(--safe-area-right))',
    pt:'calc(14px + var(--safe-area-top))',
    pb:'calc(14px + var(--safe-area-bottom))',
    bgcolor:'background.default',
  }}>
    <Box sx={{...claySx(resolvedMode),p:1.6,mb:2}}>
      <Stack direction="row" alignItems="center" spacing={1.2}>
        <Avatar sx={{width:40,height:40,bgcolor:'primary.main',color:resolvedMode==='dark'?'#063426':'#fff',fontWeight:800}}>₹</Avatar>
        <Box sx={{minWidth:0}}>
          <Typography sx={{fontWeight:800,letterSpacing:'.08em'}}>LEDGER</Typography>
          <Typography variant="caption" color="text.secondary">Personal finance</Typography>
        </Box>
      </Stack>
    </Box>

    <Stack spacing={0.5}>
      {nav.map(item=><Box
        key={item.to}
        component={NavLink}
        to={item.to}
        sx={{
          display:'flex',
          alignItems:'center',
          gap:1.2,
          px:1.25,
          py:1.05,
          borderRadius:2,
          color:location.pathname===item.to?'primary.main':'text.secondary',
          bgcolor:location.pathname===item.to?'action.selected':'transparent',
          textDecoration:'none',
          fontWeight:700,
          transition:'all .18s ease',
          '&:hover':{bgcolor:'action.hover',color:'text.primary'},
          '& svg':{fontSize:20}
        }}
      >
        {item.icon}<span>{item.label}</span>
      </Box>)}
    </Stack>

    <Box sx={{flex:1}}/>
    <Divider sx={{my:1.75}}/>

    <Stack direction="row" alignItems="center" spacing={1.1} sx={{minWidth:0}}>
      <Box sx={{minWidth:0,flex:1}}>
        <Typography sx={{fontWeight:700}} noWrap>{profileName}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{profileHandle||'Private ledger'}</Typography>
      </Box>
      <IconButton size="small" onClick={signOut} aria-label="Sign out">
        <LogoutRoundedIcon fontSize="small"/>
      </IconButton>
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

    <Box sx={{ml:{md:`${drawerWidth}px`},minWidth:0}}>
      <Box
        component="header"
        sx={{
          position:'sticky',
          top:0,
          zIndex:20,
          pl:{
            xs:'calc(10px + var(--safe-area-left))',
            sm:'calc(16px + var(--safe-area-left))',
            lg:'calc(24px + var(--safe-area-left))',
          },
          pr:{
            xs:'calc(10px + var(--safe-area-right))',
            sm:'calc(16px + var(--safe-area-right))',
            lg:'calc(24px + var(--safe-area-right))',
          },
          pt:{
            xs:'calc(8px + var(--safe-area-top))',
            sm:'calc(10px + var(--safe-area-top))',
          },
          pb:{xs:1,sm:1.25},
          bgcolor:resolvedMode==='dark'?'rgba(11,14,18,.92)':'rgba(239,243,241,.92)',
          backdropFilter:'blur(16px)',
          borderBottom:'1px solid',
          borderColor:'divider',
        }}
      >
        {!desktop&&<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{mb:1}}>
          <Box sx={{minWidth:0}}>
            <Typography sx={{fontWeight:800,lineHeight:1.1}}>Ledger</Typography>
            <Typography variant="caption" color="text.secondary">{scopeLabel}</Typography>
          </Box>
          {!nativeApp&&<IconButton
            aria-label="iPhone Shortcuts"
            onClick={()=>navigate('/profile?tab=shortcuts')}
            sx={{width:40,height:40}}
          >
            <PhoneIphoneRoundedIcon/>
          </IconButton>}
        </Stack>}

        <Stack
          direction={{xs:'column',md:'row'}}
          spacing={1}
          alignItems={{md:'center'}}
          justifyContent="space-between"
        >
          <Box sx={{
            display:'grid',
            gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'160px 210px'},
            gap:1,
            minWidth:0,
          }}>
            <FormControl size="small" fullWidth>
              <Select
                value={period.key}
                onChange={e=>setPeriodKey(e.target.value as typeof period.key)}
                aria-label="Select period"
                sx={{'& .MuiSelect-select':{py:1,fontSize:{xs:13,sm:14}}}}
              >
                {options.map(o=><MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <Select
                value={scopeKey}
                onChange={e=>setScopeKey(String(e.target.value))}
                aria-label="Select family scope"
                sx={{'& .MuiSelect-select':{py:1,fontSize:{xs:13,sm:14}}}}
              >
                <MenuItem value="self">Self</MenuItem>
                <MenuItem value="family">Family</MenuItem>
                <MenuItem value="all">Self + Family</MenuItem>
                {linkedUsers.map(user=><MenuItem key={user.id} value={`user:${user.id}`}>{user.name} · {user.handle}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{textAlign:{xs:'left',md:'right'},lineHeight:1.35}}
          >
            {period.rangeLabel}
          </Typography>
        </Stack>
      </Box>

      <Box component="main" sx={{
        width:'100%',
        maxWidth:1440,
        mx:'auto',
        pt:{xs:1.25,sm:2,lg:3},
        pl:{
          xs:'calc(10px + var(--safe-area-left))',
          sm:'calc(16px + var(--safe-area-left))',
          lg:'calc(24px + var(--safe-area-left))',
        },
        pr:{
          xs:'calc(10px + var(--safe-area-right))',
          sm:'calc(16px + var(--safe-area-right))',
          lg:'calc(24px + var(--safe-area-right))',
        },
        pb:{
          xs:nativeApp?'calc(92px + var(--safe-area-bottom))':'calc(24px + var(--safe-area-bottom))',
          md:'calc(24px + var(--safe-area-bottom))',
        },
      }}>
        <Outlet/>
      </Box>
    </Box>

    {!desktop&&nativeApp&&<BottomNavigation
      showLabels
      value={nav.findIndex(item=>item.to==='/'?location.pathname==='/':location.pathname.startsWith(item.to))}
      onChange={(_,index)=>navigate(nav[index].to)}
      sx={{
        position:'fixed',
        left:'calc(8px + var(--safe-area-left))',
        right:'calc(8px + var(--safe-area-right))',
        bottom:'calc(8px + var(--safe-area-bottom))',
        zIndex:30,
        height:68,
        borderRadius:3,
        border:'1px solid',
        borderColor:'divider',
        boxShadow:6,
        bgcolor:'background.paper',
        overflowX:'auto',
        justifyContent:'flex-start',
        '& .MuiBottomNavigationAction-root':{minWidth:72,maxWidth:96,px:.5},
        '& .MuiBottomNavigationAction-label':{fontSize:10,whiteSpace:'nowrap'},
        '& .MuiBottomNavigationAction-label.Mui-selected':{fontSize:10},
      }}
    >
      {nav.map(item=><BottomNavigationAction
        key={item.to}
        label={item.label==='Profile & Settings'?'Profile':item.label==='AI Insights'?'AI':item.label}
        icon={item.icon}
      />)}
    </BottomNavigation>}
  </Box>
}

export default function Layout(){
  return <FamilyProvider><PeriodProvider><Shell/></PeriodProvider></FamilyProvider>
}
