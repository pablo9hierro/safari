/**
 * Status reais de `vrtech.service_requests` — o mesmo enum já usado pelo
 * painel (RequestDetailModal). A assistente nunca inventa um estado: sempre
 * lê um destes.
 */
export type ServiceStatus =
  | 'pending'
  | 'aguardando_diagnostico'
  | 'diagnostico_enviado'
  | 'accepted'
  | 'rejected'
  | 'retirada_local'
  | 'em_busca'
  | 'in_progress'
  | 'completed'
  | 'em_pagamento'
  | 'em_entrega'
  | 'delivered'
  | 'finished'
  | 'cancelled'

/** Descrição curta e segura pro cliente — nunca observação interna do lojista. */
export const STATUS_DESCRIPTION: Record<ServiceStatus, string> = {
  pending: 'Solicitação recebida, aguardando análise inicial.',
  aguardando_diagnostico: 'Aparelho recebido, aguardando o diagnóstico físico.',
  diagnostico_enviado: 'Diagnóstico concluído — orçamento disponível, aguardando sua aprovação.',
  accepted: 'Orçamento aprovado. Aguardando coleta ou chegada do aparelho na loja.',
  rejected: 'Orçamento recusado. Atendimento encerrado.',
  retirada_local: 'Aguardando você trazer o aparelho até a loja.',
  em_busca: 'A loja está a caminho para buscar o aparelho.',
  in_progress: 'Aparelho em reparo neste momento.',
  completed: 'Reparo concluído! Falta combinar a entrega/retirada.',
  em_pagamento: 'Reparo concluído, aguardando o pagamento para liberar a entrega.',
  em_entrega: 'Aparelho a caminho de entrega.',
  delivered: 'Aparelho já entregue.',
  finished: 'Atendimento concluído.',
  cancelled: 'Atendimento cancelado.',
}

/** Status em que o reparo já terminou — a partir daqui dá pra agendar a entrega. */
export const REPAIR_DONE_STATUSES: ServiceStatus[] = ['completed', 'em_pagamento']

export type ServiceSummary = {
  id: string
  status: ServiceStatus
  phone_model: string | null
  problem_description: string
  quote_value: number | null
  self_pickup: boolean
  created_at: string
}

export type DiagnosticSummary = {
  services_selected: string[] | null
  notes: string | null
  quote_value: number | null
  pdf_url: string | null
}

export type RepairSummary = {
  completed_services: string | null
  warranty: string | null
  final_value: number | null
  pdf_url: string | null
  closed_at: string | null
}

export class ServiceLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid_transition' | 'validation',
  ) {
    super(message)
    this.name = 'ServiceLifecycleError'
  }
}
