import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import type {ReactNode} from 'react'
import {api} from './api/client'

export type FamilySharing={transactions:boolean;debts:boolean;investments:boolean}
export type LinkedUser={
  id:number
  email?:string
  handle:string
  handle_raw?:string
  name:string
  phone?:string|null
  link_id:number
  label?:string|null
  sharing:FamilySharing
  shared_with_me:FamilySharing
}
export type FamilyScopeKey='self'|'family'|'all'|string

type FamilyContextValue={
  scopeKey:FamilyScopeKey
  setScopeKey:(key:FamilyScopeKey)=>void
  linkedUsers:LinkedUser[]
  incoming:any[]
  outgoing:any[]
  refreshFamily:()=>Promise<void>
  familyScope:'self'|'family'|'all'
  familyUserId?:number
  scopeLabel:string
}

const FamilyContext=createContext<FamilyContextValue|null>(null)

export function FamilyProvider({children}:{children:ReactNode}){
  const [scopeKey,setScopeKey]=useState<FamilyScopeKey>('self')
  const [linkedUsers,setLinkedUsers]=useState<LinkedUser[]>([])
  const [incoming,setIncoming]=useState<any[]>([])
  const [outgoing,setOutgoing]=useState<any[]>([])

  async function refreshFamily(){
    try{
      const network=await api.familyNetwork()
      const users=(network.linked||[]).map((x:any)=>({
        ...x.user,
        link_id:x.link_id,
        label:x.label||null,
        sharing:x.sharing||{transactions:true,debts:true,investments:true},
        shared_with_me:x.shared_with_me||{transactions:true,debts:true,investments:true},
      }))
      setLinkedUsers(users)
      setIncoming(network.incoming||[])
      setOutgoing(network.outgoing||[])
      if(scopeKey.startsWith('user:')){
        const id=Number(scopeKey.split(':')[1])
        if(!users.some((x:LinkedUser)=>x.id===id))setScopeKey('self')
      }
    }catch{
      setLinkedUsers([])
      setIncoming([])
      setOutgoing([])
    }
  }

  useEffect(()=>{refreshFamily()},[])

  const derived=useMemo(()=>{
    if(scopeKey==='self')return {familyScope:'self' as const,familyUserId:undefined,scopeLabel:'Self'}
    if(scopeKey==='family')return {familyScope:'family' as const,familyUserId:undefined,scopeLabel:'Family'}
    if(scopeKey==='all')return {familyScope:'all' as const,familyUserId:undefined,scopeLabel:'Self + Family'}
    if(scopeKey.startsWith('user:')){
      const id=Number(scopeKey.split(':')[1])
      const user=linkedUsers.find(x=>x.id===id)
      return {familyScope:'all' as const,familyUserId:id,scopeLabel:user?.name||'Family member'}
    }
    return {familyScope:'self' as const,familyUserId:undefined,scopeLabel:'Self'}
  },[scopeKey,linkedUsers])

  return <FamilyContext.Provider value={{
    scopeKey,
    setScopeKey,
    linkedUsers,
    incoming,
    outgoing,
    refreshFamily,
    ...derived,
  }}>{children}</FamilyContext.Provider>
}

export function useFamily(){
  const ctx=useContext(FamilyContext)
  if(!ctx)throw new Error('useFamily must be used inside FamilyProvider')
  return ctx
}
