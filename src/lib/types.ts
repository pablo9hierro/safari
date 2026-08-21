export type ServiceStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'retirada_local'
  | 'em_busca'
  | 'in_progress'
  | 'em_entrega'
  | 'completed'
  | 'em_pagamento'
  | 'delivered'
  | 'finished'
  | 'cancelled'
  | 'aguardando_diagnostico'
  | 'diagnostico_enviado'

export interface PaymentMethodEntry {
  method: string
  value: number
}

export interface ServiceRequest {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email: string
  phone_model: string | null
  problem_description: string
  image_url: string | null
  address_cep?: string | null
  address_number?: string | null
  address_reference?: string | null
  address_street?: string | null
  address_neighborhood?: string | null
  address_city?: string | null
  address_state?: string | null
  address_label?: string | null
  shipping_price?: number | null
  self_pickup?: boolean
  status: ServiceStatus
  quote_value: number | null
  owner_notes: string | null
  discount_percent?: number | null
  payment_methods?: PaymentMethodEntry[]
  selected_service_ids?: string[]
  diagnosis_requested?: boolean
  estimated_quote?: number | null
}

export interface ServiceCatalogCategory {
  id: string
  name: string
  slug: string
  sort_order: number
  image_url?: string | null
}

export interface ServiceCatalogItem {
  id: string
  category_id: string
  model_name: string
  repair_type: string
  price: number
  description: string | null
  sort_order: number
  active: boolean
}

export interface ServiceDiagnostic {
  id: string
  service_request_id: string
  services_selected: Array<{ id: string; repair_type: string; price: number }>
  notes: string | null
  pdf_url: string | null
  quote_confirmed: number | null
  created_at: string
}

export interface ServiceRequestFormData {
  customer_name: string
  customer_phone: string
  customer_email: string
  phone_model: string
  problem_description: string
  image?: FileList
  self_pickup?: boolean
  address_neighborhood?: string
  address_street?: string
  address_number?: string
  address_reference?: string
}

export interface ServiceOrderChecklistItem {
  component: string
  checked: boolean
  description: string
  media_urls?: string[]
  value?: number | null
  // Resolução com o estoque, feita no momento em que o item é marcado na checklist (OS1).
  stock_item_id?: string | null
  warranty_days?: number | null
  // Setado na conclusão (OS3) — marca a peça como comprometida (trava edição numa reabertura
  // e é o ponto de partida pro cálculo de validade da garantia).
  added_at?: string | null
  note?: string | null
}

export type ServiceOrderActionType =
  | 'created'
  | 'checklist_update'
  | 'update'
  | 'completed'
  | 'reopened'

export interface ServiceOrderUpdate {
  id: string
  service_order_id: string
  created_at: string
  message: string | null
  media_urls: string[]
  action_type: ServiceOrderActionType | string
  component?: string | null
}

export interface ServiceOrder {
  id: string
  request_id: string
  created_at: string
  updated_at: string
  checklist: ServiceOrderChecklistItem[]
  completed_services: string | null
  warranty: string | null
  final_value: number | null
  pdf_url: string | null
  closed_at: string | null
  used_parts?: UsedPart[]
  service_order_updates?: ServiceOrderUpdate[]
}

export type StockUnit = 'unidade' | 'caixa'
export type StockMovementType = 'entrada' | 'saida'

export interface StockItem {
  id: string
  name: string
  unit: StockUnit
  quantity: number
  price?: number | null
  warranty_days?: number | null
  /** Só quando unit = 'caixa': quantas unidades vêm dentro de uma caixa. */
  units_per_box?: number | null
  created_at: string
  updated_at: string
}

export interface UsedPart {
  stock_item_id: string | null
  name: string
  quantity: number
  unit: StockUnit
  price: number | null
  note?: string | null
  warranty_days: number | null
  added_at: string
}

export interface StockMovement {
  id: string
  item_id: string
  type: StockMovementType
  quantity: number
  unit: StockUnit
  moved_at: string
  created_at: string
  stock_items?: { name: string; unit: StockUnit } | null
}

export interface NeighborhoodShippingRate {
  id: string
  neighborhood: string
  price: number
  created_at: string
  updated_at: string
}

export interface ProductCategory {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  quantity: number
  category_id: string | null
  phone_brand: string | null
  phone_model: string | null
  image_url: string | null
  image_urls?: string[]
  active: boolean
  created_at: string
  updated_at: string
  product_categories?: { name: string } | null
  /** Tags de busca geradas por IA -- nunca aparecem soltas, só dentro do accordion recolhido do card. */
  tags?: string[]
}

export type StoreOrderStatus = 'pendente' | 'vendido' | 'recusado'

export interface StoreOrderItem {
  id: string
  store_order_id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  status: StoreOrderStatus
  discount_percent?: number | null
  payment_methods?: PaymentMethodEntry[]
}

export interface StoreOrder {
  id: string
  customer_name: string
  customer_whatsapp: string
  neighborhood: string | null
  shipping_price: number
  pickup_at_store: boolean
  total_value: number
  status: StoreOrderStatus
  created_at: string
  updated_at: string
  store_order_items?: StoreOrderItem[]
}
