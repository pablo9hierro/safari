export type PdvSaleStatus = 'aberta' | 'concluida' | 'cancelada'
export type PdvItemType = 'product' | 'service'
export type PdvPaymentMethod = 'pix' | 'cartao' | 'dinheiro'
export type PdvPaymentStatus = 'pendente' | 'confirmado' | 'cancelado'

export type PdvSaleItem = {
  id: string
  sale_id: string
  item_type: PdvItemType
  product_id: string | null
  service_id: string | null
  label: string
  quantity: number
  unit_price: number
  service_request_id: string | null
  stock_deducted: boolean
}

export type PdvPayment = {
  id: string
  sale_id: string
  method: PdvPaymentMethod
  amount: number
  status: PdvPaymentStatus
  installments: number | null
  change_amount: number | null
  mp_payment_id: string | null
  created_at: string
  confirmed_at: string | null
}

export type PdvSale = {
  id: string
  status: PdvSaleStatus
  total_value: number
  notes: string | null
  created_at: string
  updated_at: string
  concluded_at: string | null
}

export type PdvSaleWithDetails = PdvSale & {
  items: PdvSaleItem[]
  payments: PdvPayment[]
}

export class PdvError extends Error {
  constructor(message: string, readonly code: 'validation' | 'not_found' | 'conflict' | 'insufficient_stock') {
    super(message)
    this.name = 'PdvError'
  }
}
