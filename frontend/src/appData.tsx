import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import type {ReactNode} from 'react'
import {api} from './api/client'
import {useUI} from './ui'

type AppDataContextValue={
  auth:any
  accounts:any[]
  categories:any[]
  aiSettings:any
  loading:boolean
  error:string
  refreshAccounts:()=>Promise<void>
  refreshCategories:()=>Promise<void>
  refreshAISettings:()=>Promise<void>
  refreshBootstrap:()=>Promise<void>
}

const AppDataContext=createContext<AppDataContextValue|null>(null)

export function AppDataProvider({auth,children}:{auth:any;children:ReactNode}){
  const {hydratePreferences}=useUI()
  const [accounts,setAccounts]=useState<any[]>([])
  const [categories,setCategories]=useState<any[]>([])
  const [aiSettings,setAISettings]=useState<any>({status:'not_configured'})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function refreshBootstrap(){
    setLoading(true)
    setError('')
    try{
      const data=await api.bootstrap()
      setAccounts(data.accounts||[])
      setCategories(data.categories||[])
      setAISettings(data.ai_settings||{status:'not_configured'})
      if(data.preferences)hydratePreferences(data.preferences)
    }catch(e:any){
      setError(e.message||'Could not load application data.')
    }finally{
      setLoading(false)
    }
  }

  async function refreshAccounts(){
    const rows=await api.accounts()
    setAccounts(rows)
  }

  async function refreshCategories(){
    const rows=await api.categories()
    setCategories(rows)
  }

  async function refreshAISettings(){
    const settings=await api.aiSettings()
    setAISettings(settings)
  }

  useEffect(()=>{refreshBootstrap()},[auth?.user_id])

  const value=useMemo(()=>({
    auth,
    accounts,
    categories,
    aiSettings,
    loading,
    error,
    refreshAccounts,
    refreshCategories,
    refreshAISettings,
    refreshBootstrap,
  }),[auth,accounts,categories,aiSettings,loading,error])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(){
  const value=useContext(AppDataContext)
  if(!value)throw new Error('useAppData must be used inside AppDataProvider')
  return value
}
