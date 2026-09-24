import {useSearchParams} from 'react-router-dom'
import {
  Box,
  Stack,
  Typography,
} from '@mui/material'
import BankImport from '../components/BankImport'
import UPIImport from '../components/UPIImport'
import DebtImport from '../components/DebtImport'
import InvestmentImport from '../components/InvestmentImport'
import BillImport from '../components/BillImport'
import ReconciliationCenter from '../components/ReconciliationCenter'
import SectionNav from '../components/SectionNav'

type ImportMode='bank'|'upi'|'bill'|'reconciliation'|'debt'|'investment'

export default function ImportReview(){
  const [searchParams,setSearchParams]=useSearchParams()
  const rawTab=searchParams.get('tab')
  const mode:ImportMode=rawTab==='upi'||rawTab==='bill'||rawTab==='reconciliation'||rawTab==='debt'||rawTab==='investment'?rawTab:'bank'
  const setMode=(value:ImportMode)=>setSearchParams(value==='bank'?{}:{tab:value})

  return <Stack spacing={{xs:1.4,sm:2}}>
    <Box>
      <Typography variant="overline" color="text.secondary">SAFE IMPORT</Typography>
      <Typography variant="h1">Import finance data</Typography>
      <Typography color="text.secondary" sx={{mt:.6}}>
        Import statements, UPI history, bills, debt documents and broker holdings from one workspace.
      </Typography>
    </Box>

    <SectionNav
      value={mode}
      onChange={setMode}
      ariaLabel="Import finance data sections"
      items={[
        {value:'bank',label:'Bank'},
        {value:'upi',label:'UPI'},
        {value:'bill',label:'Bills'},
        {value:'reconciliation',label:'Review'},
        {value:'debt',label:'Debt'},
        {value:'investment',label:'Investments'},
      ]}
    />

    {mode==='bank'&&<BankImport/>}
    {mode==='upi'&&<UPIImport/>}
    {mode==='bill'&&<BillImport/>}
    {mode==='reconciliation'&&<ReconciliationCenter/>}
    {mode==='debt'&&<DebtImport/>}
    {mode==='investment'&&<InvestmentImport/>}
  </Stack>
}
