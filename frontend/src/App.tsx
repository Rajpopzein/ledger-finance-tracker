import {useEffect,useState} from 'react'
import {Routes,Route} from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Transactions from './pages/Transactions'
import ImportReview from './pages/ImportReview'
import AIInsights from './pages/AIInsights'
import Settings from './pages/Settings'
import Auth from './pages/Auth'
import {api} from './api/client'

export default function App(){
  const [auth,setAuth]=useState<any|null>(null)

  const refreshAuth=()=>api.authStatus()
    .then(setAuth)
    .catch(()=>setAuth({setup_required:false,authenticated:false}))

  useEffect(()=>{refreshAuth()},[])

  if(!auth)return <div className="loading">Checking secure session…</div>
  if(!auth.authenticated)return <Auth setupRequired={!!auth.setup_required} onAuthenticated={refreshAuth}/>

  return <Routes>
    <Route element={<Layout/>}>
      <Route path="/" element={<Overview/>}/>
      <Route path="/transactions" element={<Transactions/>}/>
      <Route path="/import" element={<ImportReview/>}/>
      <Route path="/ai" element={<AIInsights/>}/>
      <Route path="/settings" element={<Settings/>}/>
    </Route>
  </Routes>
}
