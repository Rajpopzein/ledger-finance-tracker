import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import type {ReactNode} from 'react'
import {api} from './api/client'

export type FamilyMember={id:number;member_code:string;name:string;is_active?:boolean}
export type FamilyScopeKey='self'|'family'|'all'|string

type FamilyContextValue={
  scopeKey:FamilyScopeKey
  setScopeKey:(key:FamilyScopeKey)=>void
  members:FamilyMember[]
  refreshMembers:()=>Promise<void>
  familyScope:'self'|'family'|'all'
  familyMemberId?:number
  scopeLabel:string
}

const FamilyContext=createContext<FamilyContextValue|null>(null)

export function FamilyProvider({children}:{children:ReactNode}){
  const [scopeKey,setScopeKey]=useState<FamilyScopeKey>('self')
  const [members,setMembers]=useState<FamilyMember[]>([])

  async function refreshMembers(){
    try{
      const rows=await api.familyMembers()
      setMembers(rows)
      if(scopeKey.startsWith('member:')){
        const id=Number(scopeKey.split(':')[1])
        if(!rows.some((x:FamilyMember)=>x.id===id))setScopeKey('self')
      }
    }catch{
      setMembers([])
    }
  }

  useEffect(()=>{refreshMembers()},[])

  const derived=useMemo(()=>{
    if(scopeKey==='self')return {familyScope:'self' as const,familyMemberId:undefined,scopeLabel:'Self'}
    if(scopeKey==='family')return {familyScope:'family' as const,familyMemberId:undefined,scopeLabel:'Family'}
    if(scopeKey==='all')return {familyScope:'all' as const,familyMemberId:undefined,scopeLabel:'Self + Family'}
    if(scopeKey.startsWith('member:')){
      const id=Number(scopeKey.split(':')[1])
      const member=members.find(x=>x.id===id)
      return {familyScope:'all' as const,familyMemberId:id,scopeLabel:member?.name||'Family member'}
    }
    return {familyScope:'self' as const,familyMemberId:undefined,scopeLabel:'Self'}
  },[scopeKey,members])

  return <FamilyContext.Provider value={{
    scopeKey,
    setScopeKey,
    members,
    refreshMembers,
    ...derived
  }}>{children}</FamilyContext.Provider>
}

export function useFamily(){
  const ctx=useContext(FamilyContext)
  if(!ctx)throw new Error('useFamily must be used inside FamilyProvider')
  return ctx
}
