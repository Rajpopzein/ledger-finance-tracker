const IS_NATIVE_APP=
  Boolean(import.meta.env.TAURI_ENV_PLATFORM)||
  (typeof window!=='undefined'&&(
    window.location.protocol==='tauri:'||
    window.location.hostname==='tauri.localhost'
  ))

const API=import.meta.env.VITE_API_URL || (IS_NATIVE_APP?'https://ledger-finance-raj-api.onrender.com/api':'/api')

const SESSION_KEY='ledger_session_token'

async function ledgerFetch(input:string,init?:RequestInit):Promise<Response>{
  if(IS_NATIVE_APP){
    const {fetch:nativeFetch}=await import('@tauri-apps/plugin-http')
    return nativeFetch(input,init)
  }
  return fetch(input,{...init,credentials:'include'})
}

async function req<T>(path:string,init?:RequestInit):Promise<T>{
  const token=localStorage.getItem(SESSION_KEY)
  const headers=new Headers(init?.headers||{})
  if(token)headers.set('Authorization',`Bearer ${token}`)
  let r:Response
  try{
    r=await ledgerFetch(API+path,{...init,headers})
  }catch(error:any){
    const message=IS_NATIVE_APP
      ? 'Cannot reach the Ledger API from this app. Check your internet connection and try again.'
      : (error?.message||'Network request failed')
    throw new Error(message)
  }
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
 bootstrap:()=>req<any>('/bootstrap'),
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
 transactions:(opts:{
   q?:string
   from?:string
   to?:string
   familyScope?:string
   familyUserId?:number
   accountId?:number
   status?:string
   direction?:'debit'|'credit'
   page?:number
   pageSize?:number
 }={})=>{
   const p=new URLSearchParams()
   if(opts.q)p.set('q',opts.q)
   if(opts.from)p.set('from_date',opts.from)
   if(opts.to)p.set('to_date',opts.to)
   p.set('family_scope',opts.familyScope||'self')
   if(opts.familyUserId)p.set('family_user_id',String(opts.familyUserId))
   if(opts.accountId)p.set('account_id',String(opts.accountId))
   if(opts.status)p.set('status',opts.status)
   if(opts.direction)p.set('direction',opts.direction)
   p.set('page',String(opts.page||1))
   p.set('page_size',String(opts.pageSize||25))
   return req<any>(`/transactions?${p.toString()}`)
 },
 aiCategorize:(transactionIds:number[],providerUserId?:number)=>req<any>('/transactions/ai-categorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction_ids:transactionIds,provider_user_id:providerUserId||null})}),
 undoCategory:(txId:number)=>req<any>(`/transactions/${txId}/category/undo`,{method:'POST'}),
 updateTransaction:(txId:number,body:any)=>req<any>(`/transactions/${txId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 deleteTransaction:(txId:number)=>req<any>(`/transactions/${txId}`,{method:'DELETE'}),
 setTransactionCategory:(txId:number,category:string)=>req<any>(`/transactions/${txId}/category`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category})}),
 shortcutStatus:()=>req<any>('/shortcuts/status'),
 shortcutCreateToken:()=>req<any>('/shortcuts/token',{method:'POST'}),
 shortcutRevokeToken:()=>req<any>('/shortcuts/token',{method:'DELETE'}),
 investments:(familyScope='self',familyMemberId?:number)=>{
   const p=new URLSearchParams()
   p.set('family_scope',familyScope)
   if(familyMemberId)p.set('family_user_id',String(familyMemberId))
   return req<any>(`/investments?${p.toString()}`)
 },
 createInvestment:(body:any)=>req<any>('/investments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 updateInvestment:(id:number,body:any)=>req<any>(`/investments/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 deleteInvestment:(id:number)=>req<any>(`/investments/${id}`,{method:'DELETE'}),
 investmentPreview:(platform:string,file:File,password?:string)=>{
   const f=new FormData()
   f.append('platform',platform)
   f.append('file',file)
   if(password)f.append('password',password)
   return req<any>('/investments/import/preview',{method:'POST',body:f})
 },
 investmentCommit:(platform:string,file:File,password?:string)=>{
   const f=new FormData()
   f.append('platform',platform)
   f.append('file',file)
   if(password)f.append('password',password)
   return req<any>('/investments/import/commit',{method:'POST',body:f})
 },
 debts:(familyScope='self',familyMemberId?:number)=>{
   const p=new URLSearchParams()
   p.set('family_scope',familyScope)
   if(familyMemberId)p.set('family_user_id',String(familyMemberId))
   return req<any>(`/debts?${p.toString()}`)
 },
 createDebt:(body:any)=>req<any>('/debts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 updateDebt:(debtId:number,body:any)=>req<any>(`/debts/${debtId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 deleteDebt:(debtId:number)=>req<any>(`/debts/${debtId}`,{method:'DELETE'}),
 addDebtPayment:(debtId:number,body:any)=>req<any>(`/debts/${debtId}/payments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 debtAIPreview:(file:File)=>{
   const f=new FormData()
   f.append('file',file)
   return req<any>('/debts/ai-preview',{method:'POST',body:f})
 },
 accounts:()=>req<any[]>('/accounts'),
 createAccount:(body:any)=>req<any>('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 deleteAccount:(accountId:number)=>req<any>(`/accounts/${accountId}?delete_transactions=true`,{method:'DELETE'}),
 categories:()=>req<any[]>('/categories'),
 profile:()=>req<any>('/profile'),
 updateProfile:(body:{name:string;handle:string;phone?:string|null})=>req<any>('/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preferences:()=>req<any>('/preferences'),
 updatePreferences:(body:{theme_mode:'light'|'dark'|'system';dashboard_template:'balanced'|'focus'|'insights'})=>req<any>('/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 familyNetwork:()=>req<any>('/family-network'),
 linkFamily:(handle:string,label?:string)=>req<any>('/family-links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,label:label||null})}),
 familyLinkAction:(linkId:number,action:'accept'|'reject')=>req<any>(`/family-links/${linkId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}),
 updateFamilySharing:(linkId:number,sharing:{transactions:boolean;debts:boolean;investments:boolean;ai_insights:boolean;ai_categorization:boolean})=>req<any>(`/family-links/${linkId}/sharing`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(sharing)}),
 removeFamilyLink:(linkId:number)=>req<any>(`/family-links/${linkId}`,{method:'DELETE'}),
 manualTransaction:(body:{
   amount:number
   direction:'credit'|'debit'
   payment_method:'cash'|'upi'
   account_id?:number|null
   category:string
   txn_at:string
   merchant?:string|null
   note?:string|null
 })=>req<any>('/transactions/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 cash:(body:any)=>req('/transactions/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preview:(accountId:number,file:File,password?:string)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   if(password)f.append('password',password)
   return req<any>('/imports/preview',{method:'POST',body:f})
 },
 reprocess:(accountId:number,file:File,password?:string)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   if(password)f.append('password',password)
   return req<any>('/imports/reprocess',{method:'POST',body:f})
 },
 bankCommit:(accountId:number,file:File,password?:string)=>{
   const f=new FormData()
   f.append('account_id',String(accountId))
   f.append('file',file)
   if(password)f.append('password',password)
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
 aiCapabilities:()=>req<any>('/ai/capabilities'),
 aiHistory:(limit=40)=>req<any>(`/ai/history?limit=${limit}`),
 aiHistoryDetail:(id:number)=>req<any>(`/ai/history/${id}`),
 deleteAIHistory:(id:number)=>req<any>(`/ai/history/${id}`,{method:'DELETE'}),
 clearAIHistory:()=>req<any>('/ai/history',{method:'DELETE'}),
 saveAI:(body:any)=>req('/ai/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 askAI:(question:string,from?:string,to?:string,familyScope='self',familyUserId?:number,providerUserId?:number)=>req<any>('/ai/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   question,
   from_date:from||null,
   to_date:to||null,
   family_scope:familyScope,
   family_user_id:familyUserId||null,
   provider_user_id:providerUserId||null,
 })})
}
