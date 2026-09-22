import {FormEvent,useState} from 'react'
import {api} from '../api/client'
import './Auth.css'

export default function Auth({setupRequired,onAuthenticated}:{setupRequired:boolean,onAuthenticated:()=>void}){
  const [mode,setMode]=useState<'login'|'family-signup'>(setupRequired?'login':'login')
  const [memberCode,setMemberCode]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  const familySignup=!setupRequired&&mode==='family-signup'

  function switchMode(next:'login'|'family-signup'){
    setMode(next)
    setError('')
    setPassword('')
    setConfirm('')
    setMemberCode('')
  }

  async function submit(e:FormEvent){
    e.preventDefault()
    setError('')

    const creatingOwner=setupRequired
    const creatingFamily=familySignup

    if((creatingOwner||creatingFamily) && password!==confirm){
      setError('Passwords do not match.')
      return
    }
    if((creatingOwner||creatingFamily) && password.length<12){
      setError('Use at least 12 characters.')
      return
    }
    if(creatingFamily && !memberCode.trim()){
      setError('Enter the Member ID created by the Ledger owner.')
      return
    }

    setBusy(true)
    try{
      if(creatingOwner){
        await api.setupOwner(email,password)
      }else if(creatingFamily){
        await api.familySignup(memberCode.trim(),email,password)
      }else{
        await api.login(email,password)
      }
      onAuthenticated()
    }catch(err:any){
      setError(err.message||'Authentication failed')
    }finally{
      setBusy(false)
    }
  }

  const title=setupRequired
    ? 'Create your owner account'
    : familySignup
      ? 'Create family account'
      : 'Sign in'

  const description=setupRequired
    ? 'This first account becomes the owner of this Ledger installation.'
    : familySignup
      ? 'Use the Member ID given to you by the Ledger owner.'
      : 'Sign in as the owner or a registered family member.'

  return <div className="auth-page">
    <div className="auth-card">
      <div className="auth-brand"><div className="logo">₹</div><b>LEDGER</b></div>

      {!setupRequired&&<div className="auth-mode-tabs">
        <button type="button" className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>Sign in</button>
        <button type="button" className={mode==='family-signup'?'active':''} onClick={()=>switchMode('family-signup')}>Sign up</button>
      </div>}

      <small>{setupRequired?'PRIVATE SETUP':familySignup?'FAMILY SIGNUP':'PRIVATE ACCESS'}</small>
      <h1>{title}</h1>
      <p>{description}</p>

      <form onSubmit={submit}>
        {familySignup&&<label>
          Member ID
          <input
            value={memberCode}
            autoComplete="off"
            required
            placeholder="e.g. FAMILY-002"
            onChange={e=>setMemberCode(e.target.value)}
          />
        </label>}

        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={e=>setEmail(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={setupRequired||familySignup?'new-password':'current-password'}
            required
            value={password}
            onChange={e=>setPassword(e.target.value)}
          />
        </label>

        {(setupRequired||familySignup)&&<label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e=>setConfirm(e.target.value)}
          />
        </label>}

        {(setupRequired||familySignup)&&<div className="auth-hint">Minimum 12 characters. Use a unique password.</div>}
        {familySignup&&<div className="auth-hint">The Member ID must already exist in Settings → Family members.</div>}
        {error&&<div className="auth-error">{error}</div>}

        <button className="primary auth-submit" disabled={busy}>
          {busy?'Please wait…':setupRequired?'Create owner account':familySignup?'Create family account':'Sign in'}
        </button>
      </form>

      <div className="auth-security">
        <b>Protected session</b>
        <span>Owner and family sessions use HttpOnly cookies. Family accounts are restricted to their own ledger view.</span>
      </div>
    </div>
  </div>
}
