import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import type {ReactNode} from 'react'
import {CssBaseline,ThemeProvider,createTheme} from '@mui/material'
import {api} from './api/client'

export type ThemeMode='light'|'dark'|'system'
export type DashboardTemplate='balanced'|'focus'|'insights'

type UIContextValue={
  themeMode:ThemeMode
  resolvedMode:'light'|'dark'
  dashboardTemplate:DashboardTemplate
  setThemeMode:(mode:ThemeMode)=>void
  setDashboardTemplate:(template:DashboardTemplate)=>void
  savePreferences:()=>Promise<void>
  loading:boolean
}

const UIContext=createContext<UIContextValue|null>(null)

function resolveMode(mode:ThemeMode):'light'|'dark'{
  if(mode!=='system')return mode
  if(typeof window==='undefined')return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'
}

export function UIProvider({children}:{children:ReactNode}){
  const [themeMode,setThemeModeState]=useState<ThemeMode>(()=>(localStorage.getItem('ledger-theme') as ThemeMode)||'dark')
  const [dashboardTemplate,setDashboardTemplateState]=useState<DashboardTemplate>(()=>(localStorage.getItem('ledger-dashboard-template') as DashboardTemplate)||'balanced')
  const [systemTick,setSystemTick]=useState(0)
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: light)')
    const onChange=()=>setSystemTick(x=>x+1)
    media.addEventListener?.('change',onChange)
    return()=>media.removeEventListener?.('change',onChange)
  },[])

  useEffect(()=>{
    let active=true
    api.preferences()
      .then(p=>{
        if(!active)return
        const mode=(p.theme_mode||'dark') as ThemeMode
        const template=(p.dashboard_template||'balanced') as DashboardTemplate
        setThemeModeState(mode)
        setDashboardTemplateState(template)
        localStorage.setItem('ledger-theme',mode)
        localStorage.setItem('ledger-dashboard-template',template)
      })
      .catch(()=>{})
    return()=>{active=false}
  },[])

  const resolvedMode=useMemo(()=>resolveMode(themeMode),[themeMode,systemTick])

  function setThemeMode(mode:ThemeMode){
    setThemeModeState(mode)
    localStorage.setItem('ledger-theme',mode)
  }

  function setDashboardTemplate(template:DashboardTemplate){
    setDashboardTemplateState(template)
    localStorage.setItem('ledger-dashboard-template',template)
  }

  async function savePreferences(){
    setLoading(true)
    try{
      await api.updatePreferences({
        theme_mode:themeMode,
        dashboard_template:dashboardTemplate,
      })
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    document.documentElement.dataset.theme=resolvedMode
    document.documentElement.style.colorScheme=resolvedMode
  },[resolvedMode])

  const theme=useMemo(()=>createTheme({
    palette:{
      mode:resolvedMode,
      primary:{main:resolvedMode==='dark'?'#78E6B6':'#178B65'},
      secondary:{main:resolvedMode==='dark'?'#A7B8FF':'#5866C7'},
      background:{
        default:resolvedMode==='dark'?'#0B0E12':'#EFF3F1',
        paper:resolvedMode==='dark'?'#151A20':'#F7FAF8',
      },
      text:{
        primary:resolvedMode==='dark'?'#F5F8F6':'#15201B',
        secondary:resolvedMode==='dark'?'#98A49F':'#64706B',
      },
      divider:resolvedMode==='dark'?'rgba(255,255,255,.08)':'rgba(18,43,34,.10)',
    },
    shape:{borderRadius:14},
    typography:{
      fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1:{fontSize:'clamp(1.65rem,4vw,2.55rem)',fontWeight:750,letterSpacing:'-.03em',lineHeight:1.12},
      h2:{fontSize:'1.12rem',fontWeight:720,letterSpacing:'-.015em'},
      button:{textTransform:'none',fontWeight:700},
    },
    components:{
      MuiCssBaseline:{
        styleOverrides:{
          body:{minWidth:0,overflowX:'hidden'},
          '*':{boxSizing:'border-box'},
        }
      },
      MuiPaper:{
        styleOverrides:{
          root:{
            backgroundImage:'none',
          }
        }
      },
      MuiButton:{
        defaultProps:{disableElevation:true},
        styleOverrides:{
          root:{borderRadius:10,minHeight:40}
        }
      },
      MuiTextField:{
        defaultProps:{size:'small'}
      },
      MuiSelect:{
        defaultProps:{size:'small'}
      }
    }
  }),[resolvedMode])

  return <UIContext.Provider value={{
    themeMode,
    resolvedMode,
    dashboardTemplate,
    setThemeMode,
    setDashboardTemplate,
    savePreferences,
    loading,
  }}>
    <ThemeProvider theme={theme}>
      <CssBaseline/>
      {children}
    </ThemeProvider>
  </UIContext.Provider>
}

export function useUI(){
  const value=useContext(UIContext)
  if(!value)throw new Error('useUI must be used inside UIProvider')
  return value
}

export const claySx=(mode:'light'|'dark')=>({
  border:'1px solid',
  borderColor:'divider',
  borderRadius:2.25,
  background:mode==='dark'
    ? 'linear-gradient(145deg, rgba(31,38,47,.95), rgba(17,22,28,.96))'
    : 'linear-gradient(145deg, rgba(255,255,255,.98), rgba(232,239,235,.98))',
  boxShadow:mode==='dark'
    ? '6px 8px 20px rgba(0,0,0,.28), -4px -4px 14px rgba(52,63,74,.10), inset 1px 1px 0 rgba(255,255,255,.04)'
    : '6px 8px 18px rgba(127,145,136,.15), -4px -4px 14px rgba(255,255,255,.70), inset 1px 1px 0 rgba(255,255,255,.8)',
})
