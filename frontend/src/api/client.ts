const API=import.meta.env.VITE_API_URL || '/api'
async function req<T>(path:string,init?:RequestInit):Promise<T>{const r=await fetch(API+path,init);if(!r.ok)throw new Error((await r.text())||r.statusText);return r.json()}
const dateQs=(from?:string,to?:string)=>{const p=new URLSearchParams();if(from)p.set('from_date',from);if(to)p.set('to_date',to);const s=p.toString();return s?`?${s}`:''}
export const api={
 summary:(from?:string,to?:string)=>req<any>(`/summary${dateQs(from,to)}`),
 transactions:(q='',from?:string,to?:string)=>{const p=new URLSearchParams();if(q)p.set('q',q);if(from)p.set('from_date',from);if(to)p.set('to_date',to);const s=p.toString();return req<any[]>(`/transactions${s?`?${s}`:''}`)},
 accounts:()=>req<any[]>('/accounts'),
 createAccount:(body:any)=>req<any>('/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 categories:()=>req<any[]>('/categories'),
 cash:(body:any)=>req('/transactions/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 preview:(accountId:number,file:File)=>{const f=new FormData();f.append('account_id',String(accountId));f.append('file',file);return req<any>('/imports/preview',{method:'POST',body:f})},
 commit:(token:string)=>req<any>(`/imports/commit/${token}`,{method:'POST'}),
 aiSettings:()=>req<any>('/ai/settings'), saveAI:(body:any)=>req('/ai/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
 askAI:(question:string,from?:string,to?:string)=>req<any>('/ai/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,from_date:from||null,to_date:to||null})})
}
