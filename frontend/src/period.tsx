import {createContext,useContext,useMemo,useState} from 'react'
import type {ReactNode} from 'react'

type PeriodKey='current'|'previous'|'quarter'|'year'|'last3'|'all'
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
  const quarterStartMonth=Math.floor(now.getMonth()/3)*3
  const quarterStart=new Date(now.getFullYear(),quarterStartMonth,1)
  const quarterEnd=new Date(now.getFullYear(),quarterStartMonth+3,0)
  const yearStart=new Date(now.getFullYear(),0,1)
  const yearEnd=new Date(now.getFullYear(),11,31)
  const last3Start=new Date(now.getFullYear(),now.getMonth()-2,1)

  return [
    {key:'current',label:'This month',from:iso(currentStart),to:iso(currentEnd),rangeLabel:rangeLabel(currentStart,currentEnd)},
    {key:'previous',label:'Previous month',from:iso(prevStart),to:iso(prevEnd),rangeLabel:rangeLabel(prevStart,prevEnd)},
    {key:'quarter',label:'This quarter',from:iso(quarterStart),to:iso(quarterEnd),rangeLabel:rangeLabel(quarterStart,quarterEnd)},
    {key:'year',label:'This year',from:iso(yearStart),to:iso(yearEnd),rangeLabel:rangeLabel(yearStart,yearEnd)},
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
