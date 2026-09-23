import {useState} from 'react'
import {
  Box,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import BankImport from '../components/BankImport'
import UPIImport from '../components/UPIImport'
import DebtImport from '../components/DebtImport'
import InvestmentImport from '../components/InvestmentImport'
import {claySx,useUI} from '../ui'

type ImportMode='bank'|'upi'|'debt'|'investment'

export default function ImportReview(){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)
  const [mode,setMode]=useState<ImportMode>('bank')

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">SAFE IMPORT</Typography>
      <Typography variant="h1">Import finance data</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>
        Import statements, UPI history, debt documents and broker holdings from one workspace.
      </Typography>
    </Box>

    <Paper sx={{...clay,p:.6,width:'fit-content',maxWidth:'100%'}}>
      <Tabs
        value={mode}
        onChange={(_,value:ImportMode)=>setMode(value)}
        variant="scrollable"
        scrollButtons={false}
        allowScrollButtonsMobile
      >
        <Tab value="bank" label="Bank"/>
        <Tab value="upi" label="UPI"/>
        <Tab value="debt" label="Debt"/>
        <Tab value="investment" label="Investments"/>
      </Tabs>
    </Paper>

    {mode==='bank'&&<BankImport/>}
    {mode==='upi'&&<UPIImport/>}
    {mode==='debt'&&<DebtImport/>}
    {mode==='investment'&&<InvestmentImport/>}
  </Stack>
}
