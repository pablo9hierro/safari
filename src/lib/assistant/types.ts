export type AssistantConfig = {
  id: string
  enabled: boolean
  prompt_interpreter: string
  prompt_validator: string
  start_keywords: string[]
  end_keywords: string[]
  window_timeout_minutes: number
  message_batch_window_seconds: number
  min_response_chars: number
  max_response_chars: number
  ai_provider: string
  ai_model: string
  api_key: string | null
  updated_at: string
}

export type ConversationRow = {
  id: string
  phone: string
  customer_name: string | null
  status: 'aberta' | 'fechada'
  human_override: boolean
  started_at: string
  last_message_at: string
  closed_at: string | null
}

export type MessageRow = {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  sender_type: 'cliente' | 'assistente' | 'humano'
  content: string
  created_at: string
}
