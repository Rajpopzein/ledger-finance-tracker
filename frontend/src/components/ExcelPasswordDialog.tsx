import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'

type Props={
  open:boolean
  fileName?:string
  password:string
  busy?:boolean
  error?:string
  onPasswordChange:(value:string)=>void
  onSubmit:()=>void
  onCancel:()=>void
}

export default function ExcelPasswordDialog({
  open,
  fileName,
  password,
  busy=false,
  error='',
  onPasswordChange,
  onSubmit,
  onCancel,
}:Props){
  return <Dialog
    open={open}
    onClose={busy?undefined:onCancel}
    fullWidth
    maxWidth="xs"
  >
    <DialogTitle>Password required</DialogTitle>
    <DialogContent>
      <Stack spacing={1.5} sx={{pt:.5}}>
        <Typography variant="body2" color="text.secondary">
          {fileName||'This Excel file'} is password-protected. Enter its password to open and import it.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          label="Excel password"
          type="password"
          value={password}
          disabled={busy}
          onChange={e=>onPasswordChange(e.target.value)}
          onKeyDown={e=>{
            if(e.key==='Enter'&&password&&!busy)onSubmit()
          }}
          autoComplete="off"
        />
        {error&&<Alert severity="error">{error}</Alert>}
        <Typography variant="caption" color="text.secondary">
          The password is used only in memory to unlock this upload. Ledger does not save it.
        </Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="contained" onClick={onSubmit} disabled={!password||busy}>
        {busy?'Unlocking…':'Unlock file'}
      </Button>
    </DialogActions>
  </Dialog>
}
