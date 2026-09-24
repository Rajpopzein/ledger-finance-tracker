type CacheEntry<T>={
  value:T
  storedAt:number
}

const store=new Map<string,CacheEntry<unknown>>()

export const FINANCE_CACHE_TTL_MS=2*60*1000

export function getViewCache<T>(key:string,maxAgeMs=FINANCE_CACHE_TTL_MS):T|null{
  const entry=store.get(key)
  if(!entry)return null
  if(Date.now()-entry.storedAt>maxAgeMs){
    store.delete(key)
    return null
  }
  return entry.value as T
}

export function setViewCache<T>(key:string,value:T){
  store.set(key,{value,storedAt:Date.now()})
}

export function invalidateViewCache(prefix?:string){
  if(!prefix){
    store.clear()
    return
  }
  for(const key of store.keys()){
    if(key.startsWith(prefix))store.delete(key)
  }
}
