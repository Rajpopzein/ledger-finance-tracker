const API=import.meta.env.VITE_API_URL || '/api'

async function req<T>(path:string,init?:RequestInit):Promise<T>{
  const r=await fetch(API+path,{...init,credentials:'include'})
  if(!r.ok){
    let message=r.statusText
    try{
      const body=await r.json()
      message=body.detail||JSON.stringify(body)
    }catch{
      message=(await r.text())||message
    }
    throw new Error(message)
  }
  return r.json()
}

const dateQs=(from?:string,to?:string)=>{
  const p=new URLSearchParams()
  if(from)p.set('from_date',from)
  if(to)p.set('to_date',to)
  const s=p.toString()
  return s?`?${s}`:''
}

export const api={
 authStatus:()=>req<any>('/auth/status'),
 setupOwner:(email:string,password:string)=>req<any>('/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}),
 login:(email:string,password:string)=>req<any>('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}),
 logout:()=>req<any>('/auth/logout',{method:'POST'}),
 summary:(from?:string,to?:string)=>req<any>(`/summary${dateQs(from,to)}`),
 transactions:(q='',from?:string,to?:string)=>{
   const p=new URLSearchParams()
   if(q)p.set('q',q)
   if(from)p.set('from_date',from)
   if(to)p.set('to_date',to)
   const s=p.toString()
   return req<any[]>(`/transactions${s?`?${s}`:''}`)
 },
 accounts:()=>req<any[]>('/accounts'),
 createAccount:(body:any)=>req<any>('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 categories:()=>req<any[]>('/categories'),
 cash:(body:any)=>req('/transactions/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preview:(accountId:number,file:File)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   return req<any>('/imports/preview',{method:'POST',body:f})
 },
 commit:(token:string)=>req<any>(`/imports/commit/${token}`,{method:'POST'}),
 aiSettings:()=>req<any>('/ai/settings'),
 saveAI:(body:any)=>req('/ai/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 askAI:(question:string,from?:string,to?:string)=>req<any>('/ai/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,from_date:from||null,to_date:to||null})})
}
