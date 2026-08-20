import { redirect } from 'next/navigation'
import { adminRedirectTarget } from '@/lib/serverProxy'

// Config do assistente (prompt, gatilhos, etc.) mudou de vez pra
// /meu-plano/assistente-ia (a-vrtek-gente) — o que sobra específico do
// vrtech (ligar/desligar agendamento via IA) mora em /dashboard/agenda.
export default async function AssistentePage() {
  redirect(await adminRedirectTarget('/dashboard/agenda'))
}
