import {createContext,useContext,useMemo,useState} from 'react'
import type {ReactNode} from 'react'

type PeriodKey='current'|'quarter'|'year'|'all'
export type Period={key:PeriodKey;label:string;from:string;to:string;rangeLabel:string}

type PeriodContextValue={period:Period;setPeriodKey:(key:PeriodKey)=>void;options:Period[]}
const PeriodContext=createContext<PeriodContextValue|null>(null)

const pad=(n:number)=>String(n).padStart(2,'0')
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const rangeLabel=(a:Date,b:Date)=>`${a.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} – ${b.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`
const startMonth=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1)
const endMonth=(d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,0)

function buildPeriods():Period[]{
  const now=new Date()
  const currentStart=startMonth(now)
  const currentEnd=endMonth(now)
  const quarterStartMonth=Math.floor(now.getMonth()/3)*3
  const quarterStart=new Date(now.getFullYear(),quarterStartMonth,1)
  const quarterEnd=new Date(now.getFullYear(),quarterStartMonth+3,0)
  const yearStart=new Date(now.getFullYear(),0,1)
  const yearEnd=new Date(now.getFullYear(),11,31)

  return [
    {key:'current',label:'Month',from:iso(currentStart),to:iso(currentEnd),rangeLabel:rangeLabel(currentStart,currentEnd)},
    {key:'quarter',label:'Quarter',from:iso(quarterStart),to:iso(quarterEnd),rangeLabel:rangeLabel(quarterStart,quarterEnd)},
    {key:'year',label:'Year',from:iso(yearStart),to:iso(yearEnd),rangeLabel:rangeLabel(yearStart,yearEnd)},
    {key:'all',label:'All time',from:'',to:'',rangeLabel:'All imported transactions'},
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
