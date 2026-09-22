const API=import.meta.env.VITE_API_URL || '/api'

const SESSION_KEY='ledger_session_token'

async function req<T>(path:string,init?:RequestInit):Promise<T>{
  const token=localStorage.getItem(SESSION_KEY)
  const headers=new Headers(init?.headers||{})
  if(token)headers.set('Authorization',`Bearer ${token}`)
  const r=await fetch(API+path,{...init,headers,credentials:'include'})
  const raw=await r.text()

  let body:any=null
  if(raw){
    try{
      body=JSON.parse(raw)
    }catch{
      body=raw
    }
  }

  if(!r.ok){
    const message=
      body && typeof body==='object' && body.detail
        ? body.detail
        : typeof body==='string' && body
          ? body
          : r.statusText || `Request failed with status ${r.status}`
    throw new Error(message)
  }

  return body as T
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
 signup:(name:string,handle:string,email:string,password:string)=>req<any>('/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,handle,email,password})}),
 login:async(email:string,password:string)=>{
   const result=await req<any>('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
   if(result?.session_token)localStorage.setItem(SESSION_KEY,result.session_token)
   return result
 },
 logout:async()=>{
   try{return await req<any>('/auth/logout',{method:'POST'})}
   finally{localStorage.removeItem(SESSION_KEY)}
 },
 summary:(from?:string,to?:string,familyScope='self',familyMemberId?:number)=>{
   const p=new URLSearchParams()
   if(from)p.set('from_date',from)
   if(to)p.set('to_date',to)
   p.set('family_scope',familyScope)
   if(familyMemberId)p.set('family_user_id',String(familyMemberId))
   return req<any>(`/summary?${p.toString()}`)
 },
 transactions:(q='',from?:string,to?:string,familyScope='self',familyMemberId?:number)=>{
   const p=new URLSearchParams()
   if(q)p.set('q',q)
   if(from)p.set('from_date',from)
   if(to)p.set('to_date',to)
   p.set('family_scope',familyScope)
   if(familyMemberId)p.set('family_user_id',String(familyMemberId))
   const s=p.toString()
   return req<any[]>(`/transactions${s?`?${s}`:''}`)
 },
 accounts:()=>req<any[]>('/accounts'),
 createAccount:(body:any)=>req<any>('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 categories:()=>req<any[]>('/categories'),
 profile:()=>req<any>('/profile'),
 updateProfile:(body:{name:string;handle:string;phone?:string|null})=>req<any>('/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preferences:()=>req<any>('/preferences'),
 updatePreferences:(body:{theme_mode:'light'|'dark'|'system';dashboard_template:'balanced'|'focus'|'insights'})=>req<any>('/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 familyNetwork:()=>req<any>('/family-network'),
 linkFamily:(handle:string,label?:string)=>req<any>('/family-links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,label:label||null})}),
 familyLinkAction:(linkId:number,action:'accept'|'reject')=>req<any>(`/family-links/${linkId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}),
 removeFamilyLink:(linkId:number)=>req<any>(`/family-links/${linkId}`,{method:'DELETE'}),
 cash:(body:any)=>req('/transactions/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preview:(accountId:number,file:File)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   return req<any>('/imports/preview',{method:'POST',body:f})
 },
 reprocess:(accountId:number,file:File)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   return req<any>('/imports/reprocess',{method:'POST',body:f})
 },
 bankCommit:(accountId:number,file:File)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   return req<any>('/imports/bank/commit',{method:'POST',body:f})
 },
 upiPreview:(app:string,file:File)=>{
   const f=new FormData()
   f.append('app',app)
   f.append('file',file)
   return req<any>('/imports/upi/preview',{method:'POST',body:f})
 },
 upiCommit:(app:string,file:File)=>{
   const f=new FormData()
   f.append('app',app)
   f.append('file',file)
   return req<any>('/imports/upi/commit',{method:'POST',body:f})
 },
 aiSettings:()=>req<any>('/ai/settings'),
 saveAI:(body:any)=>req('/ai/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 askAI:(question:string,from?:string,to?:string)=>req<any>('/ai/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,from_date:from||null,to_date:to||null})})
}
