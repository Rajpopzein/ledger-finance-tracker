export type UserRef={id:number;name:string;handle:string}

export type Tx={
  id:number
  txn_at:string
  amount:number
  direction:'debit'|'credit'
  txn_type:string
  merchant?:string
  description?:string
  payment_method?:string
  verification_status:string
  excluded:boolean
  account:string
  category:string
  user?:UserRef|null
  sources:{type:string;name:string}[]
}

export type Summary={
  income:number
  spent:number
  available:number
  verified:number
  total:number
  needs_review:number
  categories:{name:string;amount:number}[]
  cashflow:{label:string;income:number;spent:number}[]
  family_spending:{id:number;handle:string;name:string;amount:number}[]
}
