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
import ReconciliationCenter from '../components/ReconciliationCenter'
import {claySx,useUI} from '../ui'

type ImportMode='bank'|'upi'|'reconciliation'|'debt'|'investment'

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

    <Paper
      sx={{
        ...clay,
        p:.5,
        width:{xs:'100%',sm:'fit-content'},
        maxWidth:'100%',
        overflow:'hidden',
        borderRadius:2,
      }}
    >
      <Tabs
        value={mode}
        onChange={(_,value:ImportMode)=>setMode(value)}
        variant="scrollable"
        scrollButtons={false}
        allowScrollButtonsMobile
        sx={{
          minHeight:38,
          maxWidth:'100%',
          '& .MuiTabs-scroller':{overflow:'hidden !important'},
          '& .MuiTabs-flexContainer':{gap:.5},
          '& .MuiTabs-indicator':{display:'none'},
          '& .MuiTab-root':{
            minHeight:38,
            minWidth:0,
            px:{xs:1.1,sm:1.6},
            py:.75,
            borderRadius:1.5,
            color:'text.secondary',
            flex:{xs:'1 1 0',sm:'0 0 auto'},
            whiteSpace:'nowrap',
          },
          '& .MuiTab-root.Mui-selected':{
            color:'text.primary',
            bgcolor:'action.selected',
          },
        }}
      >
        <Tab disableRipple value="bank" label="Bank"/>
        <Tab disableRipple value="upi" label="UPI"/>
        <Tab disableRipple value="reconciliation" label="Review"/>
        <Tab disableRipple value="debt" label="Debt"/>
        <Tab disableRipple value="investment" label="Investments"/>
      </Tabs>
    </Paper>

    {mode==='bank'&&<BankImport/>}
    {mode==='upi'&&<UPIImport/>}
    {mode==='reconciliation'&&<ReconciliationCenter/>}
    {mode==='debt'&&<DebtImport/>}
    {mode==='investment'&&<InvestmentImport/>}
  </Stack>
}
