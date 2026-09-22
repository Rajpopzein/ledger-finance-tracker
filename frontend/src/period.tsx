import {createContext,useContext,useMemo,useState} from 'react'
import type {ReactNode} from 'react'

type PeriodKey='current'|'previous'|'last3'|'all'
export type Period={key:PeriodKey;label:string;from:string;to:string;rangeLabel:string}

type PeriodContextValue={period:Period;setPeriodKey:(key:PeriodKey)=>void;options:Period[]}
const PeriodContext=createContext<PeriodContextValue|null>(null)

const pad=(n:number)=>String(n).padStart(2,'0')
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const monthLabel=(d:Date)=>d.toLocaleDateString('en-IN',{month:'long',year:'numeric'})
const rangeLabel=(a:Date,b:Date)=>`${a.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} – ${b.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`
const startMonth=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1)
const endMonth=(d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,0)

function buildPeriods():Period[]{
  const now=new Date()
  const currentStart=startMonth(now), currentEnd=endMonth(now)
  const prevDate=new Date(now.getFullYear(),now.getMonth()-1,1)
  const prevStart=startMonth(prevDate), prevEnd=endMonth(prevDate)
  const last3Start=new Date(now.getFullYear(),now.getMonth()-2,1)

  return [
    {key:'current',label:monthLabel(currentStart),from:iso(currentStart),to:iso(currentEnd),rangeLabel:rangeLabel(currentStart,currentEnd)},
    {key:'previous',label:monthLabel(prevStart),from:iso(prevStart),to:iso(prevEnd),rangeLabel:rangeLabel(prevStart,prevEnd)},
    {key:'last3',label:'Last 3 months',from:iso(last3Start),to:iso(currentEnd),rangeLabel:rangeLabel(last3Start,currentEnd)},
    {key:'all',label:'All data',from:'',to:'',rangeLabel:'All imported transactions'}
  ]
}

export function PeriodProvider({children}:{children:ReactNode}){
  const options=useMemo(buildPeriods,[])
  const [key,setKey]=useState<PeriodKey>('current')
  const period=options.find(x=>x.key===key) ?? options[0]!
  return <PeriodContext.Provider value={{period,setPeriodKey:setKey,options}}>{children}</PeriodContext.Provider>
}

export function usePeriod(){
  const ctx=useContext(PeriodContext)
  if(!ctx)throw new Error('usePeriod must be used inside PeriodProvider')
  return ctx
}
