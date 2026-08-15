import { createServiceClient } from '@/lib/supabase/service'
import {
  ServiceLifecycleError,
  type DiagnosticSummary,
  type RepairSummary,
  type ServiceStatus,
  type ServiceSummary,
} from './types'

type Db = ReturnType<typeof createServiceClient>

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Solicitações do telefone informado, mais recentes primeiro. É assim que a
 * conversa (identificada só pelo número do WhatsApp) se liga ao cliente —
 * mesmo padrão de correspondência usado em `/api/consultar` e no
 * `consultar_pedido` já existente. Nunca aceita `request_id` de fora sem
 * confirmar que pertence a este telefone — é isso que impede um cliente de
 * consultar o aparelho de outro.
 */
export async function getActiveServicesForPhone(
  phone: string,
  db: Db = createServiceClient(),
): Promise<ServiceSummary[]> {
  const digits = digitsOnly(phone)
  if (digits.length < 8) throw new ServiceLifecycleError('Telefone inválido.', 'validation')

  const { data, error } = await db
    .from('service_requests')
    .select('id, status, phone_model, problem_description, quote_value, self_pickup, created_at, customer_phone')
    .ilike('customer_phone', `%${digits.slice(-8, -4)}%`)
    .ilike('customer_phone', `%${digits.slice(-4)}%`)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new ServiceLifecycleError(`Falha ao consultar solicitações: ${error.message}`, 'validation')

  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status as ServiceStatus,
    phone_model: r.phone_model,
    problem_description: r.problem_description,
    quote_value: r.quote_value,
    self_pickup: !!r.self_pickup,
    created_at: r.created_at,
  }))
}

/** Confirma que a solicitação pertence a este telefone antes de expor qualquer dado dela. */
async function loadOwnedRequest(
  requestId: string,
  phone: string,
  db: Db,
): Promise<{ id: string; status: ServiceStatus; phone_model: string | null; quote_value: number | null; self_pickup: boolean }> {
  const digits = digitsOnly(phone)
  const { data, error } = await db
    .from('service_requests')
    .select('id, status, phone_model, quote_value, self_pickup, customer_phone')
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new ServiceLifecycleError(`Falha ao buscar solicitação: ${error.message}`, 'validation')
  if (!data || !digitsOnly(data.customer_phone).includes(digits.slice(-8))) {
    throw new ServiceLifecycleError('Solicitação não encontrada para este telefone.', 'not_found')
  }
  return {
    id: data.id,
    status: data.status as ServiceStatus,
    phone_model: data.phone_model,
    quote_value: data.quote_value,
    self_pickup: !!data.self_pickup,
  }
}

export async function getServiceStatus(
  requestId: string,
  phone: string,
  db: Db = createServiceClient(),
): Promise<ServiceSummary> {
  const req = await loadOwnedRequest(requestId, phone, db)
  const { data } = await db
    .from('service_requests')
    .select('problem_description, created_at')
    .eq('id', requestId)
    .single()
  return {
    id: req.id,
    status: req.status,
    phone_model: req.phone_model,
    problem_description: data?.problem_description ?? '',
    quote_value: req.quote_value,
    self_pickup: req.self_pickup,
    created_at: data?.created_at ?? '',
  }
}

/**
 * Diagnóstico — só o que é seguro mostrar ao cliente. `notes` da tabela
 * `service_diagnostics` é o texto que o técnico escreve pro próprio
 * diagnóstico; não existe hoje um campo separado "observação interna" nessa
 * tabela, então notes é tratado como conteúdo do diagnóstico em si (mesma
 * informação que vai pro PDF que o cliente recebe), não como nota privada
 * do lojista — diferente de `service_requests.owner_notes`, que este módulo
 * NUNCA lê nem expõe.
 */
export async function getServiceDiagnostic(
  requestId: string,
  phone: string,
  db: Db = createServiceClient(),
): Promise<DiagnosticSummary | null> {
  await loadOwnedRequest(requestId, phone, db)
  const { data } = await db
    .from('service_diagnostics')
    .select('services_selected, notes, quote_confirmed, pdf_url')
    .eq('service_request_id', requestId)
    .maybeSingle()
  if (!data) return null
  return {
    services_selected: data.services_selected,
    notes: data.notes,
    quote_value: data.quote_confirmed,
    pdf_url: data.pdf_url,
  }
}

/**
 * Status do reparo em si — só exposto quando já existe `service_orders`
 * (criado no fluxo interno de "em reparo"). `used_parts`/`checklist` dessa
 * tabela são operacionais (o que o técnico foi fazendo) e nunca são
 * retornados aqui — só o resumo que o cliente recebe quando concluído.
 */
export async function getRepairStatus(
  requestId: string,
  phone: string,
  db: Db = createServiceClient(),
): Promise<RepairSummary | null> {
  await loadOwnedRequest(requestId, phone, db)
  const { data } = await db
    .from('service_orders')
    .select('completed_services, warranty, final_value, pdf_url, closed_at')
    .eq('request_id', requestId)
    .maybeSingle()
  return data ?? null
}

/**
 * Aprova o orçamento — a mesma transição que o botão "Cliente aprovou o
 * orçamento" faz no painel (`diagnostico_enviado` → `accepted`), só que
 * disparada pelo próprio cliente via WhatsApp. Só permitida nesse status
 * exato: aprovar antes do diagnóstico, ou depois de já aprovado/recusado,
 * não faz sentido e é recusado.
 */
export async function approveServiceQuote(
  requestId: string,
  phone: string,
  db: Db = createServiceClient(),
): Promise<ServiceSummary> {
  const req = await loadOwnedRequest(requestId, phone, db)
  if (req.status !== 'diagnostico_enviado') {
    throw new ServiceLifecycleError(
      `Não é possível aprovar agora — o orçamento precisa estar aguardando aprovação (status atual: ${req.status}).`,
      'invalid_transition',
    )
  }
  return transition(requestId, phone, 'accepted', db)
}

/**
 * Recusa o orçamento. O painel usa `cancelled` (não `rejected`) exatamente
 * nesta transição — "Cliente cancelou" é a opção real ao lado de "aprovou"
 * em `diagnostico_enviado`. `rejected` é um status diferente, usado só na
 * recusa de orçamento direto em `pending` (fluxo sem diagnóstico), que esta
 * tool não cobre.
 */
export async function rejectServiceQuote(
  requestId: string,
  phone: string,
  db: Db = createServiceClient(),
): Promise<ServiceSummary> {
  const req = await loadOwnedRequest(requestId, phone, db)
  if (req.status !== 'diagnostico_enviado') {
    throw new ServiceLifecycleError(
      `Não é possível recusar agora — o orçamento precisa estar aguardando aprovação (status atual: ${req.status}).`,
      'invalid_transition',
    )
  }
  return transition(requestId, phone, 'cancelled', db)
}

/**
 * Cancela o atendimento a pedido do cliente, em qualquer etapa anterior à
 * aprovação do orçamento (pending, aguardando_diagnostico ou
 * diagnostico_enviado) — depois de aprovado (accepted) o reparo já pode
 * estar em andamento e o cancelamento deixa de ser self-service, precisa
 * passar pelo lojista. O motivo é registrado para o lojista ver (nunca é
 * lido de volta pela assistente).
 */
const CANCELABLE_STATUSES: string[] = ['pending', 'aguardando_diagnostico', 'diagnostico_enviado']

export async function cancelServiceRequest(
  requestId: string,
  phone: string,
  reason: string | undefined,
  db: Db = createServiceClient(),
): Promise<ServiceSummary> {
  const req = await loadOwnedRequest(requestId, phone, db)
  if (!CANCELABLE_STATUSES.includes(req.status)) {
    throw new ServiceLifecycleError(
      `Não é possível cancelar agora — o atendimento já passou da etapa em que o cliente pode cancelar sozinho (status atual: ${req.status}). Peça pra falar com a loja.`,
      'invalid_transition',
    )
  }

  const note = reason?.trim()
    ? `Cancelado pelo cliente via assistente. Motivo informado: ${reason.trim()}`
    : 'Cancelado pelo cliente via assistente.'

  // Anexa ao que já existir em owner_notes — nunca sobrescreve anotação
  // anterior do lojista.
  const { data: current } = await db.from('service_requests').select('owner_notes').eq('id', requestId).single()
  const mergedNotes = [current?.owner_notes, note].filter(Boolean).join('\n---\n')

  const { data, error } = await db
    .from('service_requests')
    .update({ status: 'cancelled', owner_notes: mergedNotes })
    .eq('id', requestId)
    .select('id, status, phone_model, problem_description, quote_value, self_pickup, created_at')
    .single()
  if (error) throw new ServiceLifecycleError(`Falha ao cancelar: ${error.message}`, 'validation')
  return data as ServiceSummary
}

async function transition(
  requestId: string,
  phone: string,
  next: ServiceStatus,
  db: Db,
): Promise<ServiceSummary> {
  const { data, error } = await db
    .from('service_requests')
    .update({ status: next })
    .eq('id', requestId)
    .select('id, status, phone_model, problem_description, quote_value, self_pickup, created_at')
    .single()
  if (error) throw new ServiceLifecycleError(`Falha ao atualizar status: ${error.message}`, 'validation')
  return data as ServiceSummary
}
