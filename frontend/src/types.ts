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
  account_id?:number|null
  account:string
  institution?:string
  category:string
  category_source?:string|null
  can_undo_category:boolean
  user?:UserRef|null
  sources:{type:string;name:string}[]
}

export type TransactionPage={
  items:Tx[]
  page:number
  page_size:number
  total:number
  pages:number
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

export type DebtPayment={
  id:number
  amount:number
  paid_at:string
  note?:string|null
}

export type Debt={
  id:number
  lender:string
  debt_type:string
  principal:number
  outstanding_balance:number
  interest_rate?:number|null
  emi_amount?:number|null
  start_date?:string|null
  end_date?:string|null
  next_due_date?:string|null
  status:'active'|'closed'|'paused'
  notes?:string|null
  source_type:string
  source_file_name?:string|null
  created_at?:string|null
  payments:DebtPayment[]
}

export type DebtList={
  items:Debt[]
  total_outstanding:number
  monthly_emi:number
  active_count:number
}
