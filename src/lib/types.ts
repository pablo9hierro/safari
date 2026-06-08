export type ServiceStatus = 'pending' | 'quoted' | 'accepted' | 'rejected' | 'em_busca' | 'in_progress' | 'em_entrega' | 'completed' | 'cancelled'

export interface ServiceRequest {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email: string
  phone_model: string
  problem_description: string
  image_url: string | null
  address_cep: string
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
  address_cep: string
  address_number: string
  address_reference: string
}
