import {useEffect,useState} from 'react'
import {api} from '../api/client'
import {useFamily} from '../family'

export default function Profile(){
  const {linkedUsers,incoming,outgoing,refreshFamily}=useFamily()
  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({name:'',handle:'',phone:''})
  const [linkHandle,setLinkHandle]=useState('')
  const [linkLabel,setLinkLabel]=useState('')
  const [msg,setMsg]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function loadProfile(){
    const p=await api.profile()
    setProfile(p)
    setForm({
      name:p.name||'',
      handle:p.handle_raw||String(p.handle||'').replace(/^@/,''),
      phone:p.phone||''
    })
  }

  useEffect(()=>{
    loadProfile().catch((e:any)=>setError(e.message||'Could not load profile.'))
    refreshFamily()
  },[])

  async function saveProfile(){
    setBusy(true);setError('');setMsg('')
    try{
      const p=await api.updateProfile({
        name:form.name.trim(),
        handle:form.handle.trim(),
        phone:form.phone.trim()||null
      })
      setProfile(p)
      setForm({
        name:p.name||'',
        handle:p.handle_raw||String(p.handle||'').replace(/^@/,''),
        phone:p.phone||''
      })
      setMsg('Profile updated.')
    }catch(e:any){
      setError(e.message||'Could not update profile.')
    }finally{
      setBusy(false)
    }
  }

  async function invite(){
    if(!linkHandle.trim())return
    setBusy(true);setError('');setMsg('')
    try{
      const result=await api.linkFamily(linkHandle.trim(),linkLabel.trim())
      setLinkHandle('')
      setLinkLabel('')
      setMsg('Invitation sent to '+result.user.handle+'.')
      await refreshFamily()
    }catch(e:any){
      setError(e.message||'Could not send family invitation.')
    }finally{
      setBusy(false)
    }
  }

  async function act(linkId:number,action:'accept'|'reject'){
    setBusy(true);setError('');setMsg('')
    try{
      await api.familyLinkAction(linkId,action)
      setMsg(action==='accept'?'Family invitation accepted.':'Family invitation rejected.')
      await refreshFamily()
    }catch(e:any){
      setError(e.message||'Could not update family invitation.')
    }finally{
      setBusy(false)
    }
  }

  if(!profile)return <div className="dashboard-state card">
    <div className="upload-spinner" aria-hidden="true"/>
    <div><b>Loading profile…</b><span>Fetching your Ledger identity.</span></div>
  </div>

  return <>
    <div className="page-head">
      <div>
        <small>YOUR ACCOUNT</small>
        <h1>Profile</h1>
        <p>Your handle is how other Ledger users find you for family linking.</p>
      </div>
    </div>

    {error&&<div className="attention">{error}</div>}
    {msg&&<div className="success">{msg}</div>}

    <div className="grid2">
      <section className="card">
        <div className="profile-hero">
          <div className="profile-avatar-large">{(form.name?.[0]||'U').toUpperCase()}</div>
          <div>
            <h2>{form.name||'User'}</h2>
            <b className="handle-display">@{form.handle||'handle'}</b>
            <span>{profile.email}</span>
          </div>
        </div>

        <label>Name
          <input value={form.name} maxLength={100} onChange={e=>setForm({...form,name:e.target.value})}/>
        </label>

        <label>Ledger ID / Handle
          <div className="handle-input">
            <span>@</span>
            <input
              value={form.handle}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={e=>setForm({...form,handle:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}
            />
          </div>
        </label>
        <small className="muted">3–40 characters. Letters, numbers and underscore only.</small>

        <label>Email
          <input value={profile.email||''} disabled/>
        </label>

        <label>Phone (optional)
          <input value={form.phone} placeholder="+91…" onChange={e=>setForm({...form,phone:e.target.value})}/>
        </label>

        <button className="primary" disabled={busy||!form.name.trim()||form.handle.length<3} onClick={saveProfile}>
          {busy?'Saving…':'Save profile'}
        </button>
      </section>

      <section className="card">
        <h2>Link family</h2>
        <p>Every person creates their own Ledger account first. Then link them using their unique handle.</p>

        <label>User handle
          <div className="handle-input">
            <span>@</span>
            <input
              value={linkHandle.replace(/^@/,'')}
              placeholder="raj"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={e=>setLinkHandle(e.target.value.toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_]/g,''))}
            />
          </div>
        </label>

        <label>Relationship label (optional)
          <input value={linkLabel} placeholder="e.g. Wife, Father" onChange={e=>setLinkLabel(e.target.value)}/>
        </label>

        <button className="primary" disabled={busy||linkHandle.length<3} onClick={invite}>Send family invite</button>

        {outgoing.length>0&&<div className="profile-list-block">
          <small>PENDING SENT</small>
          {outgoing.map((item:any)=><div className="profile-person" key={item.link_id}>
            <div><b>{item.user.name}</b><span>{item.user.handle}</span></div>
            <span className="badge">pending</span>
          </div>)}
        </div>}
      </section>
    </div>

    {incoming.length>0&&<section className="card profile-section">
      <div className="row between"><h2>Family invitations</h2><b className="warn">{incoming.length}</b></div>
      {incoming.map((item:any)=><div className="profile-person invite-row" key={item.link_id}>
        <div>
          <b>{item.user.name}</b>
          <span>{item.user.handle+(item.label?' • '+item.label:'')}</span>
        </div>
        <div className="profile-actions">
          <button className="secondary" disabled={busy} onClick={()=>act(item.link_id,'reject')}>Reject</button>
          <button className="primary" disabled={busy} onClick={()=>act(item.link_id,'accept')}>Accept</button>
        </div>
      </div>)}
    </section>}

    <section className="card profile-section">
      <div className="row between">
        <div><small>CONNECTED USERS</small><h2>Family</h2></div>
        <b>{linkedUsers.length}</b>
      </div>

      {linkedUsers.length
        ? linkedUsers.map(user=><div className="profile-person" key={user.id}>
            <div><b>{user.name}</b><span>{user.handle}</span></div>
          </div>)
        : <div className="empty">No linked family members yet.</div>}
    </section>
  </>
}
