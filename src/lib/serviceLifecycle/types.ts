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
  // Na prática, transitório -- nasce e migra pra retirada_local/em_busca no
  // mesmo instante (nunca fica "pendente" esperando aceite manual). Texto
  // aqui só existe como fallback pra dado histórico legado.
  pending: 'Aguardando combinar a coleta ou chegada do aparelho na loja.',
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

/**
 * Agrupamento pra exibição no painel enxuto (7 baldes). O enum granular
 * acima continua sendo a fonte de verdade real (histórico, IA, WhatsApp,
 * agenda) -- isto é só a camada de UI, nunca gravado no banco. `Record`
 * sem `Partial` força o TypeScript a recusar o build se um status novo
 * for adicionado ao enum sem ganhar um balde aqui.
 */
export type StatusGroup =
  | 'em_deslocamento'
  | 'em_diagnostico'
  | 'em_reparo'
  | 'retiradas'
  | 'concluidos'

export const STATUS_GROUP: Record<ServiceStatus, StatusGroup> = {
  // "pendente" deixou de existir como balde -- a solicitação nasce direto
  // em retirada_local/em_busca (ver POST /api/service-requests). 'pending'
  // continua no enum só por compatibilidade com dado histórico; 'accepted'
  // continua existindo como status transitório de uso interno (PDV,
  // ver agenda/service.ts), mas nenhuma tela mostra "Pendente" mais --
  // os dois caem no mesmo balde de quem está aguardando deslocamento físico.
  pending: 'em_deslocamento',
  accepted: 'em_deslocamento',
  aguardando_diagnostico: 'em_diagnostico',
  diagnostico_enviado: 'em_diagnostico',
  retirada_local: 'em_deslocamento',
  em_busca: 'em_deslocamento',
  in_progress: 'em_reparo',
  completed: 'retiradas',
  em_pagamento: 'retiradas',
  em_entrega: 'retiradas',
  delivered: 'concluidos',
  finished: 'concluidos',
  // Recusado/cancelado não desaparecem do painel -- entram em "concluidos"
  // (encerrados), mas o card se distingue visualmente (selo/cor própria,
  // ver STATUS_GROUP_ENDED) pra nunca parecer um atendimento bem-sucedido.
  rejected: 'concluidos',
  cancelled: 'concluidos',
}

/** Dentro do balde "concluidos", quais status são encerramento negativo
 * (recusado/cancelado) -- usado só pra estilizar o card diferente, nunca
 * pra filtrar/esconder. */
export const ENDED_NEGATIVE_STATUSES: ServiceStatus[] = ['rejected', 'cancelled']

export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  em_deslocamento: 'Em deslocamento',
  em_diagnostico: 'Em diagnóstico',
  em_reparo: 'Em reparo',
  retiradas: 'Retiradas',
  concluidos: 'Concluídos',
}

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
