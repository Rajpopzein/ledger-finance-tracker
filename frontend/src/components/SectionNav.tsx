import {Paper,Tab,Tabs} from '@mui/material'
import {claySx,useUI} from '../ui'

export type SectionNavItem<T extends string>={
  value:T
  label:string
}

export default function SectionNav<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
}:{
  value:T
  items:readonly SectionNavItem<T>[]
  onChange:(value:T)=>void
  ariaLabel?:string
}){
  const {resolvedMode}=useUI()
  const clay=claySx(resolvedMode)

  return <Paper
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
      value={value}
      onChange={(_,next:T)=>onChange(next)}
      variant="scrollable"
      scrollButtons={false}
      allowScrollButtonsMobile
      aria-label={ariaLabel}
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
      {items.map(item=><Tab
        key={item.value}
        disableRipple
        value={item.value}
        label={item.label}
      />)}
    </Tabs>
  </Paper>
}
