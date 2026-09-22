import {useEffect,useState} from 'react'
import {Navigate,Routes,Route} from 'react-router-dom'
import {Box,CircularProgress,Typography} from '@mui/material'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Transactions from './pages/Transactions'
import Debts from './pages/Debts'
import ImportReview from './pages/ImportReview'
import AIInsights from './pages/AIInsights'
import Profile from './pages/Profile'
import Auth from './pages/Auth'
import {api} from './api/client'

export default function App(){
  const [auth,setAuth]=useState<any|null>(null)

  const refreshAuth=()=>api.authStatus()
    .then(setAuth)
    .catch(()=>setAuth({setup_required:false,authenticated:false}))

  useEffect(()=>{refreshAuth()},[])

  if(!auth)return <Box sx={{minHeight:'100dvh',display:'grid',placeItems:'center',bgcolor:'background.default'}}>
    <Box sx={{textAlign:'center'}}><CircularProgress size={30}/><Typography color="text.secondary" sx={{mt:1.2}}>Checking secure session…</Typography></Box>
  </Box>
  if(!auth.authenticated)return <Auth setupRequired={!!auth.setup_required} onAuthenticated={refreshAuth}/>

  return <Routes>
    <Route element={<Layout/>}>
      <Route path="/" element={<Overview/>}/>
      <Route path="/transactions" element={<Transactions/>}/>
      <Route path="/debts" element={<Debts/>}/>
      <Route path="/import" element={<ImportReview/>}/>
      <Route path="/ai" element={<AIInsights/>}/>
      <Route path="/profile" element={<Profile/>}/>
      <Route path="/settings" element={<Navigate to="/profile?tab=settings" replace/>}/>
    </Route>
  </Routes>
}
