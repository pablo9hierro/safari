import { createServiceClient } from '@/lib/supabase/service'
import { missingRequiredVariables, renderTemplate, type TemplateVars } from './renderer'

/** Loja atendida por este deploy. A coluna existe para a feature já nascer isolada. */
export const TENANT_ID = 'vrtech'

export type WhatsAppTemplate = {
  id: string
  tenant_id: string
  template_key: string
  section: string
  label: string
  description: string | null
  content: string
  required_variables: string[]
  available_variables: string[]
  editable: boolean
  /** Controla se esse disparo específico acontece -- toggle por card em
   * /dashboard/template-zap. Default true (nasce ligado). */
  enabled: boolean
  sort_order: number
  updated_at: string
}

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'not_editable' | 'missing_variables' | 'validation',
  ) {
    super(message)
    this.name = 'TemplateError'
  }
}

type Db = ReturnType<typeof createServiceClient>

export async function listTemplates(db: Db = createServiceClient()): Promise<WhatsAppTemplate[]> {
  const { data, error } = await db
    .from('whatsapp_templates')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .order('section')
    .order('sort_order')
  if (error) throw new TemplateError(`Falha ao listar templates: ${error.message}`, 'validation')
  return (data ?? []) as WhatsAppTemplate[]
}

export async function getTemplate(
  key: string,
  db: Db = createServiceClient(),
): Promise<WhatsAppTemplate | null> {
  const { data, error } = await db
    .from('whatsapp_templates')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('template_key', key)
    .maybeSingle()
  if (error) return null
  return (data as WhatsAppTemplate) ?? null
}

/**
 * Ativo/inativo por template -- o disparo correspondente não sai quando
 * desativado. `renderMessage` continua devolvendo o texto normalmente
 * (é só o TEXTO, não decide se envia); quem decide enviar (a rota de
 * notify, notifyQuoteDecision) precisa checar isto ANTES de chamar
 * deliverReliable/sendWhatsAppText. Template inexistente conta como
 * habilitado (fallback hardcoded sempre dispara, como sempre foi).
 */
export async function isTemplateEnabled(key: string, db: Db = createServiceClient()): Promise<boolean> {
  const tpl = await getTemplate(key, db)
  return tpl ? tpl.enabled !== false : true
}

export async function setTemplateEnabled(
  key: string,
  enabled: boolean,
  db: Db = createServiceClient(),
): Promise<void> {
  const { error } = await db
    .from('whatsapp_templates')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_ID)
    .eq('template_key', key)
  if (error) throw new TemplateError(`Falha ao alternar template: ${error.message}`, 'validation')
}

/**
 * Texto final da mensagem.
 *
 * `fallback` é o texto que já existia hardcoded: se o template ainda não
 * estiver no banco (ou a leitura falhar), o disparo continua acontecendo com
 * o texto de sempre em vez de sair vazio ou quebrar.
 */
export async function renderMessage(
  key: string,
  vars: TemplateVars,
  fallback: string,
  db: Db = createServiceClient(),
): Promise<string> {
  try {
    const tpl = await getTemplate(key, db)
    if (!tpl?.content?.trim()) return fallback
    return renderTemplate(tpl.content, vars)
  } catch {
    return fallback
  }
}

export type UpdateTemplateInput = { content: string }

/**
 * Salva o texto de um template.
 *
 * Duas regras valem aqui no servidor, não só no formulário: template marcado
 * como não editável (o que carrega o link de pagamento) é recusado, e
 * variável obrigatória ausente impede o salvamento — senão a mensagem sairia
 * sem o dado que o cliente precisa.
 */
export async function updateTemplate(
  key: string,
  input: UpdateTemplateInput,
  db: Db = createServiceClient(),
): Promise<WhatsAppTemplate> {
  const tpl = await getTemplate(key, db)
  if (!tpl) throw new TemplateError(`Template "${key}" não encontrado.`, 'not_found')

  if (!tpl.editable) {
    throw new TemplateError(
      'Esta mensagem é gerada pelo sistema e não pode ser editada — alterá-la quebraria a cobrança.',
      'not_editable',
    )
  }

  const content = String(input.content ?? '')
  if (!content.trim()) {
    throw new TemplateError('O texto da mensagem não pode ficar vazio.', 'validation')
  }

  const missing = missingRequiredVariables(content, tpl.required_variables)
  if (missing.length > 0) {
    throw new TemplateError(
      `Template inválido: ${missing.length === 1 ? 'a variável obrigatória' : 'as variáveis obrigatórias'} ${missing.join(', ')} ${missing.length === 1 ? 'está ausente' : 'estão ausentes'}.`,
      'missing_variables',
    )
  }

  const { data, error } = await db
    .from('whatsapp_templates')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_ID)
    .eq('template_key', key)
    .select()
    .single()
  if (error) throw new TemplateError(`Falha ao salvar: ${error.message}`, 'validation')
  return data as WhatsAppTemplate
}
