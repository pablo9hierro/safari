'use client'

import { Bot } from 'lucide-react'
import AgendaSettingsCard from './AgendaSettingsCard'

/**
 * Prompt, gatilhos, timeout, exemplos de atendimento (RAG) e ativar/
 * desativar viraram config da plataforma (a-vrtek-gente), em
 * /meu-plano/assistente-ia — mesmo lugar usado pelo ramo ecommerce, um
 * único ponto de configuração independente do ramo. Esta página só
 * mantém o que é específico do vrtech (agenda de atendimento técnico) e
 * aponta pro lugar certo pro resto.
 */
export default function AssistenteClient() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Bot className="w-5 h-5 text-vr-red" />
        Assistente IA
      </h1>

      <a
        href="https://resolutoo.com/meu-plano/assistente-ia"
        target="_blank"
        rel="noreferrer"
        className="block rounded-2xl border border-vr-red/25 bg-vr-red/8 p-4 hover:bg-vr-red/12 transition-colors"
      >
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Bot className="w-4 h-4 text-vr-red" />
          Configurar prompt, gatilhos e exemplos de atendimento
        </p>
        <p className="text-xs text-vr-silver/50 mt-1">
          Ativar/desativar, editar o prompt da loja, gatilhos de início/encerramento e enviar exemplos de atendimento
          agora ficam em <span className="text-vr-silver">Meu Plano → Assistente IA</span>, na área da plataforma.
        </p>
      </a>

      <AgendaSettingsCard />
    </div>
  )
}
