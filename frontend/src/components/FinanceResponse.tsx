import {Fragment} from 'react'
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

function inline(text:string){
  const parts=text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part,index)=>{
    if(part.startsWith('**')&&part.endsWith('**')){
      return <Box component="strong" key={index} sx={{fontWeight:800,color:'text.primary'}}>
        {part.slice(2,-2)}
      </Box>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

function splitTableRow(line:string){
  return line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim())
}

function isSeparator(line:string){
  const cells=splitTableRow(line)
  return cells.length>0&&cells.every(cell=>/^:?-{3,}:?$/.test(cell))
}

export default function FinanceResponse({text}:{text:string}){
  const lines=text.replace(/\r/g,'').split('\n')
  const blocks:React.ReactNode[]=[]
  let i=0

  while(i<lines.length){
    const raw=lines[i]
    const line=raw.trim()

    if(!line){i++;continue}

    if(line.includes('|')&&i+1<lines.length&&isSeparator(lines[i+1])){
      const headers=splitTableRow(line)
      const rows:string[][]=[]
      i+=2
      while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push(
        <TableContainer key={`table-${i}`} component={Paper} variant="outlined" sx={{borderRadius:2,overflowX:'auto'}}>
          <Table size="small" sx={{minWidth:520}}>
            <TableHead>
              <TableRow>
                {headers.map((cell,index)=><TableCell key={index} sx={{fontWeight:800,bgcolor:'action.hover'}}>{inline(cell)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row,rowIndex)=><TableRow key={rowIndex}>
                {headers.map((_,cellIndex)=><TableCell key={cellIndex}>{inline(row[cellIndex]||'')}</TableCell>)}
              </TableRow>)}
            </TableBody>
          </Table>
        </TableContainer>
      )
      continue
    }

    const heading=line.match(/^(#{1,3})\s+(.+)$/)
    if(heading){
      const level=heading[1].length
      blocks.push(
        <Typography
          key={`heading-${i}`}
          variant={level===1?'h2':'h6'}
          sx={{fontWeight:800,mt:blocks.length?1.25:0,mb:.25,letterSpacing:'-.015em'}}
        >
          {inline(heading[2])}
        </Typography>
      )
      i++
      continue
    }

    const bullet=line.match(/^[-*]\s+(.+)$/)
    if(bullet){
      const items:string[]=[]
      while(i<lines.length){
        const match=lines[i].trim().match(/^[-*]\s+(.+)$/)
        if(!match)break
        items.push(match[1])
        i++
      }
      blocks.push(
        <Stack key={`bullets-${i}`} component="ul" spacing=.65 sx={{pl:2.5,my:.25}}>
          {items.map((item,index)=><Typography component="li" variant="body2" key={index} sx={{lineHeight:1.7}}>
            {inline(item)}
          </Typography>)}
        </Stack>
      )
      continue
    }

    const numbered=line.match(/^\d+[.)]\s+(.+)$/)
    if(numbered){
      const items:string[]=[]
      while(i<lines.length){
        const match=lines[i].trim().match(/^\d+[.)]\s+(.+)$/)
        if(!match)break
        items.push(match[1])
        i++
      }
      blocks.push(
        <Stack key={`numbers-${i}`} component="ol" spacing=.7 sx={{pl:2.8,my:.25}}>
          {items.map((item,index)=><Typography component="li" variant="body2" key={index} sx={{lineHeight:1.7}}>
            {inline(item)}
          </Typography>)}
        </Stack>
      )
      continue
    }

    if(/^>\s+/.test(line)){
      const quote=line.replace(/^>\s+/,'')
      blocks.push(
        <Paper key={`quote-${i}`} variant="outlined" sx={{px:1.5,py:1.1,borderLeft:3,borderLeftColor:'primary.main',bgcolor:'action.hover'}}>
          <Typography variant="body2" sx={{lineHeight:1.7}}>{inline(quote)}</Typography>
        </Paper>
      )
      i++
      continue
    }

    const paragraph=[line]
    i++
    while(i<lines.length){
      const next=lines[i].trim()
      if(!next||/^(#{1,3})\s+/.test(next)||/^[-*]\s+/.test(next)||/^\d+[.)]\s+/.test(next)||/^>\s+/.test(next))break
      if(next.includes('|')&&i+1<lines.length&&isSeparator(lines[i+1]))break
      paragraph.push(next)
      i++
    }
    blocks.push(
      <Typography key={`paragraph-${i}`} variant="body2" sx={{lineHeight:1.75,color:'text.secondary'}}>
        {inline(paragraph.join(' '))}
      </Typography>
    )
  }

  return <Stack spacing={1.25}>{blocks}</Stack>
}

export function FinanceHighlights({items}:{items:{label:string;value:string}[]}){
  if(!items.length)return null
  return <Stack direction="row" gap=.75 sx={{flexWrap:'wrap'}}>
    {items.map(item=><Chip
      key={item.label}
      variant="outlined"
      color="primary"
      label={`${item.label}: ${item.value}`}
      sx={{fontWeight:700}}
    />)}
  </Stack>
}
