export type ServiceStatus =
  | 'pending'
  | 'quoted'
  | 'accepted'
  | 'rejected'
  | 'retirada_local'
  | 'em_busca'
  | 'in_progress'
  | 'em_entrega'
  | 'completed'
  | 'cancelled'

export interface ServiceRequest {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email: string
  phone_model: string
  problem_description: string
  image_url: string | null
  address_cep?: string | null
  address_number: string
  address_reference: string
  address_street?: string
  address_neighborhood?: string
  address_city?: string
  address_state?: string
  status: ServiceStatus
  quote_value: number | null
  owner_notes: string | null
}

export interface ServiceRequestFormData {
  customer_name: string
  customer_phone: string
  customer_email: string
  phone_model: string
  problem_description: string
  image?: FileList
  address_neighborhood: string
  address_street: string
  address_number: string
  address_reference: string
}

export interface ServiceOrderChecklistItem {
  component: string
  checked: boolean
  description: string
}

export type ServiceOrderActionType =
  | 'created'
  | 'checklist_update'
  | 'update'
  | 'completed'

export interface ServiceOrderUpdate {
  id: string
  service_order_id: string
  created_at: string
  message: string | null
  media_urls: string[]
  action_type: ServiceOrderActionType | string
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
  service_order_updates?: ServiceOrderUpdate[]
}
