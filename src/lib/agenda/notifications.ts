import { sendWhatsAppText } from '@/lib/whatsapp/evolutionClient'
import { createServiceClient } from '@/lib/supabase/service'
import { formatStoreDateTime } from './slots'
import type { Appointment } from './types'

/**
 * Mensagens automáticas da secretária IA sobre mudanças na agenda.
 *
 * O texto é montado por template determinístico de propósito: a justificativa
 * do lojista entra LITERAL, sem passar pelo modelo. Deixar a IA reescrever
 * abriria espaço pra ela inventar um motivo diferente do que foi registrado —
 * exatamente o que não pode acontecer numa notificação de cancelamento.
 */

/** Registra a mensagem enviada na conversa do cliente, se houver uma aberta. */
async function logOutboundMessage(phone: string, content: string): Promise<void> {
  try {
    const db = createServiceClient()
    const digits = phone.replace(/\D/g, '')
    const { data: conv } = await db
      .from('assistant_conversations')
      .select('id')
      .ilike('phone', `%${digits}%`)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (conv?.id) {
      await db.from('assistant_messages').insert({
        conversation_id: conv.id,
        direction: 'outbound',
        sender_type: 'assistente',
        content,
      })
    }
  } catch {
    // Log de conversa é acessório — nunca impede a notificação de sair.
  }
}

async function deliver(phone: string, message: string): Promise<boolean> {
  try {
    await sendWhatsAppText(phone, message)
    await logOutboundMessage(phone, message)
    return true
  } catch (e) {
    console.error('[agenda] falha ao notificar cliente:', e instanceof Error ? e.message : e)
    return false
  }
}

export function buildRescheduleMessage(
  appointment: Appointment,
  previousStartsAt: string,
  justification: string,
): string {
  return [
    `Olá, ${appointment.customer_name}! Precisamos alterar o horário do seu atendimento.`,
    ``,
    `Serviço: ${appointment.service_label}`,
    `Horário anterior: ${formatStoreDateTime(previousStartsAt)}`,
    `Novo horário: ${formatStoreDateTime(appointment.starts_at)}`,
    ``,
    `Motivo: ${justification.trim()}`,
    ``,
    `Pedimos desculpas pelo transtorno. Se o novo horário não funcionar pra você, é só responder aqui que a gente encontra outro.`,
  ].join('\n')
}

export function buildCancellationMessage(
  appointment: Appointment,
  justification: string,
): string {
  return [
    `Olá, ${appointment.customer_name}! Informamos que seu atendimento foi cancelado.`,
    ``,
    `Serviço: ${appointment.service_label}`,
    `Horário original: ${formatStoreDateTime(appointment.starts_at)}`,
    ``,
    `Motivo: ${justification.trim()}`,
    ``,
    `Pedimos desculpas pelo transtorno. Se quiser, respondemos aqui mesmo pra encontrar um novo horário.`,
  ].join('\n')
}

export function buildCreatedMessage(appointment: Appointment): string {
  return [
    `Olá, ${appointment.customer_name}! Seu atendimento está agendado. ✅`,
    ``,
    `Serviço: ${appointment.service_label}`,
    `Data e horário: ${formatStoreDateTime(appointment.starts_at)}`,
    ``,
    `Se precisar cancelar ou remarcar, é só responder por aqui.`,
  ].join('\n')
}

export async function notifyReschedule(
  appointment: Appointment,
  previousStartsAt: string,
  justification: string,
): Promise<boolean> {
  return deliver(appointment.customer_phone, buildRescheduleMessage(appointment, previousStartsAt, justification))
}

export async function notifyCancellation(
  appointment: Appointment,
  justification: string,
): Promise<boolean> {
  return deliver(appointment.customer_phone, buildCancellationMessage(appointment, justification))
}

/**
 * Confirmação de criação pelo admin. Quando quem agenda é a própria assistente
 * na conversa, ela já confirma no fluxo — não duplicamos a mensagem.
 */
export async function notifyAppointmentCreated(appointment: Appointment): Promise<boolean> {
  if (appointment.created_by !== 'admin') return false
  return deliver(appointment.customer_phone, buildCreatedMessage(appointment))
}
