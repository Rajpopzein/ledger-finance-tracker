import {useState} from 'react'
import {
  Box,
  Stack,
  Typography,
} from '@mui/material'
import BankImport from '../components/BankImport'
import UPIImport from '../components/UPIImport'
import DebtImport from '../components/DebtImport'
import InvestmentImport from '../components/InvestmentImport'
import ReconciliationCenter from '../components/ReconciliationCenter'
import SectionNav from '../components/SectionNav'

type ImportMode='bank'|'upi'|'reconciliation'|'debt'|'investment'

export default function ImportReview(){
  const [mode,setMode]=useState<ImportMode>('bank')

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">SAFE IMPORT</Typography>
      <Typography variant="h1">Import finance data</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>
        Import statements, UPI history, debt documents and broker holdings from one workspace.
      </Typography>
    </Box>

    <SectionNav
      value={mode}
      onChange={setMode}
      ariaLabel="Import finance data sections"
      items={[
        {value:'bank',label:'Bank'},
        {value:'upi',label:'UPI'},
        {value:'reconciliation',label:'Review'},
        {value:'debt',label:'Debt'},
        {value:'investment',label:'Investments'},
      ]}
    />

    {mode==='bank'&&<BankImport/>}
    {mode==='upi'&&<UPIImport/>}
    {mode==='reconciliation'&&<ReconciliationCenter/>}
    {mode==='debt'&&<DebtImport/>}
    {mode==='investment'&&<InvestmentImport/>}
  </Stack>
}
