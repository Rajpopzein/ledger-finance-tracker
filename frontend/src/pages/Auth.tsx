import {FormEvent,useState} from 'react'
import {api} from '../api/client'
import './Auth.css'

export default function Auth({setupRequired,onAuthenticated}:{setupRequired:boolean,onAuthenticated:()=>void}){
  const [mode,setMode]=useState<'login'|'signup'>(setupRequired?'signup':'login')
  const [name,setName]=useState('')
  const [handle,setHandle]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  const signup=mode==='signup'

  function switchMode(next:'login'|'signup'){
    setMode(next)
    setError('')
    setPassword('')
    setConfirm('')
  }

  async function submit(e:FormEvent){
    e.preventDefault()
    setError('')

    if(signup){
      if(!name.trim()){
        setError('Enter your name.')
        return
      }
      if(handle.trim().length<3){
        setError('Choose a handle with at least 3 characters.')
        return
      }
      if(password!==confirm){
        setError('Passwords do not match.')
        return
      }
      if(password.length<12){
        setError('Use at least 12 characters.')
        return
      }
    }

    setBusy(true)
    try{
      if(signup){
        await api.signup(name.trim(),handle.trim(),email,password)
      }
      await api.login(email,password)
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

      <div className="auth-mode-tabs">
        <button type="button" className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>Sign in</button>
        <button type="button" className={mode==='signup'?'active':''} onClick={()=>switchMode('signup')}>Sign up</button>
      </div>

      <small>{signup?'CREATE ACCOUNT':'PRIVATE ACCESS'}</small>
      <h1>{signup?'Create your Ledger account':'Sign in'}</h1>
      <p>{signup?'Create your own account first. You can link family members later using their @handle.':'Use your personal Ledger account.'}</p>

      <form onSubmit={submit}>
        {signup&&<label>
          Name
          <input
            value={name}
            autoComplete="name"
            required
            maxLength={100}
            onChange={e=>setName(e.target.value)}
          />
        </label>}

        {signup&&<label>
          Ledger ID / Handle
          <div className="auth-handle-input">
            <span>@</span>
            <input
              value={handle}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              required
              maxLength={40}
              placeholder="raj"
              onChange={e=>setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
            />
          </div>
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
            autoComplete={signup?'new-password':'current-password'}
            required
            value={password}
            onChange={e=>setPassword(e.target.value)}
          />
        </label>

        {signup&&<label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e=>setConfirm(e.target.value)}
          />
        </label>}

        {signup&&<div className="auth-hint">
          Your handle is unique, for example <b>@raj</b>. Password minimum: 12 characters.
        </div>}

        {error&&<div className="auth-error">{error}</div>}

        <button className="primary auth-submit" disabled={busy}>
          {busy?'Please wait…':signup?'Create account':'Sign in'}
        </button>
      </form>

      <div className="auth-security">
        <b>Independent account</b>
        <span>Family linking happens after signup and does not share your password or merge your account.</span>
      </div>
    </div>
  </div>
}
