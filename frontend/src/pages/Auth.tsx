import {FormEvent,useState} from 'react'
import {api} from '../api/client'
import './Auth.css'

export default function Auth({setupRequired,onAuthenticated}:{setupRequired:boolean,onAuthenticated:()=>void}){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function submit(e:FormEvent){
    e.preventDefault()
    setError('')
    if(setupRequired && password!==confirm){
      setError('Passwords do not match.')
      return
    }
    if(setupRequired && password.length<12){
      setError('Use at least 12 characters.')
      return
    }
    setBusy(true)
    try{
      if(setupRequired) await api.setupOwner(email,password)
      else await api.login(email,password)
      onAuthenticated()
    }catch(err:any){
      setError(err.message||'Authentication failed')
    }finally{
      setBusy(false)
    }
  }

  return <div className="auth-page">
    <div className="auth-card">
      <div className="auth-brand"><div className="logo">₹</div><b>LEDGER</b></div>
      <small>{setupRequired?'PRIVATE SETUP':'PRIVATE ACCESS'}</small>
      <h1>{setupRequired?'Create your owner account':'Sign in'}</h1>
      <p>{setupRequired?'This first account becomes the only owner of this Ledger installation.':'Your financial records are protected by your owner session.'}</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={setupRequired?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} /></label>
        {setupRequired&&<label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>}
        {setupRequired&&<div className="auth-hint">Minimum 12 characters. Use a unique password.</div>}
        {error&&<div className="auth-error">{error}</div>}
        <button className="primary auth-submit" disabled={busy}>{busy?'Please wait…':setupRequired?'Create owner account':'Sign in'}</button>
      </form>
      <div className="auth-security"><b>Protected session</b><span>The login token is stored in an HttpOnly cookie and finance APIs reject unauthenticated requests.</span></div>
    </div>
  </div>
}
