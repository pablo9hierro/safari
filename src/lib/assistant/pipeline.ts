import { completeSimple, completeWithTools } from './aiClient'
import { resolveTools, executeTool, consultarAtendimentoEmAndamento } from './tools'
import { AGENDA_TOOL_NAMES } from '@/lib/agenda/tools'
import { fetchPaymentOnDeliveryEnabledServer } from '@/lib/resolutoo/platformConfig'
import type { AssistantConfig } from './types'
import type { ToolCallRecord } from './aiClient'

export const MSG_SPLIT_MARKER = '|||MSG_SPLIT|||'

type InterpreterOutput = { intent: string; params: Record<string, unknown> }

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? { ...fallback, ...JSON.parse(match[0]) } : fallback
  } catch { return fallback }
}

/**
 * Regras de agenda. Só entram no prompt quando as tools de agenda estão
 * disponíveis — sem elas, instruir o modelo a agendar geraria promessa
 * que ele não tem como cumprir.
 */
function agendaRules(): string {
  return [
    'AGENDAMENTO DE SERVIÇO (obrigatório):',
    '- SERVIÇO (reparo, manutenção, instalação, assistência técnica) SEMPRE exige agendamento. PRODUTO (venda de peça/acessório) NUNCA usa a agenda.',
    '- Nunca afirme que um horário está livre sem antes rodar consultar_disponibilidade nesta interação. Nunca deduza disponibilidade.',
    '- Se o cliente pedir atendimento "agora"/"hoje mesmo", isso também exige agendamento: consulte a disponibilidade, confirme com o cliente e rode criar_agendamento.',
    '- Só diga que está agendado DEPOIS de criar_agendamento retornar AGENDAMENTO CONFIRMADO. Se a ferramenta retornar FALHOU, explique que não foi possível e ofereça os horários alternativos que ela devolveu.',
    '- Se o cliente pedir produto e serviço na mesma conversa, trate separado: o produto segue a venda normal, o serviço vai pra agenda.',
  ].join('\n')
}

/**
 * Regras do ciclo de assistência técnica: diagnóstico → orçamento → aprovação
 * → reparo → entrega. Sempre disponível (não depende de flag) — as tools de
 * consulta já existem em qualquer conversa.
 */
function serviceLifecycleRules(): string {
  return [
    'ACOMPANHAMENTO DE ATENDIMENTO (obrigatório):',
    '- ANTES de consultar pedido ou atendimento pela primeira vez na conversa, confirme com o cliente qual número de WhatsApp está cadastrado: "esse número que você está falando é o mesmo cadastrado no seu pedido/atendimento?". Não assuma que é sempre o número desta conversa — o cliente pode estar continuando por aqui um atendimento que começou em outro canal (telefone, loja física, outro WhatsApp). Se ele confirmar que é outro número, use ESSE número na tool, não o da conversa. Depois de confirmado uma vez na conversa, não precisa perguntar de novo pro mesmo cliente.',
    '- Depois de confirmado o número, consulte o estado real (produto: consultar_pedido; serviço: consultar_meus_atendimentos) e dê continuidade dali — trate como a continuação natural do atendimento dele, não como uma conversa nova, mesmo que ele tenha vindo de outro canal.',
    '- Perguntas como "já terminou", "está pronto", "qual o problema", "quanto custa", "aprovado?" NUNCA são respondidas pela memória da conversa — rode consultar_meus_atendimentos (se ainda não souber o ID) e depois a tool específica do que foi perguntado, nesta mesma interação.',
    '- Nunca invente status, valor de orçamento, diagnóstico ou prazo de entrega. Se a ferramenta não retornar a informação, diga que ainda não está disponível.',
    '- Aprovar/recusar orçamento (aprovar_orcamento/recusar_orcamento) só depois do cliente confirmar explicitamente que aceita ou recusa o valor informado pela tool de diagnóstico — nunca decida por dedução. Frases como "pode fazer", "aceito", "pode consertar", "pode seguir" contam como aprovação explícita.',
    '- Cancelamento (cancelar_atendimento) só funciona antes da aprovação do orçamento — se a tool recusar (atendimento já aprovado/em reparo), explique que a partir dali o cancelamento depende da loja, não invente uma forma de cancelar mesmo assim.',
    '- Depois que consultar_status_atendimento (ou consultar_status_reparo) confirmar que o reparo terminou, pergunte proativamente se o cliente prefere RETIRAR na loja ou RECEBER por entrega — não espere ele perguntar. Se for entrega, confirme se o endereço é o mesmo já usado antes ou se é outro.',
    '- Entrega/retirada do aparelho (agendar_entrega_aparelho/agendar_retirada_aparelho) só pode ser AGENDADA depois que o reparo estiver concluído — confirme com consultar_status_atendimento antes se não tiver certeza. Coleta do aparelho no cliente (agendar_coleta_aparelho) pode ser agendada a qualquer momento em que o atendimento estiver ativo.',
  ].join('\n')
}

/**
 * Regra fixa, sempre presente: pra tudo que o sistema já sabe fazer, a
 * assistente executa — nunca empurra pra um humano por preguiça de chamar a
 * tool certa. "Encaminhar pra um atendente" só é aceitável quando o pedido
 * realmente está fora do que qualquer tool cobre.
 */
function noHumanHandoffRule(): string {
  return [
    '- Nunca responda "vou chamar um atendente", "um humano vai te atender" ou equivalente pra algo que uma tool já resolve (consultar, criar, agendar, remarcar, cancelar, aprovar, confirmar). Se existe tool pra isso, USE a tool. Só admita a limitação quando o pedido realmente estiver fora do que o sistema suporta — e mesmo assim, explique o que você PODE fazer em vez de só recusar.',
  ].join('\n')
}

function universalRules(config: AssistantConfig, withAgenda: boolean): string {
  const min = config.min_response_chars || 40
  const max = config.max_response_chars || 300
  return [
    'REGRAS FIXAS (nunca ignore):',
    '- Nunca invente preço, id, produto ou status — só repasse o que uma ferramenta retornou nesta interação.',
    '- Se o cliente perguntar sobre serviço de reparo, rode buscar_servicos ANTES de responder.',
    '- Se o cliente perguntar sobre produto, rode buscar_produtos ANTES de responder.',
    '- Não prometa prazo fixo que não veio de uma ferramenta.',
    noHumanHandoffRule(),
    '',
    serviceLifecycleRules(),
    `- Resposta em UMA ÚNICA mensagem curta (${min}–${max} caracteres). Vá direto ao ponto.`,
    ...(withAgenda ? ['', agendaRules()] : []),
  ].join('\n')
}

async function runInterpreter(config: AssistantConfig, userMessage: string): Promise<InterpreterOutput> {
  const system = [
    config.prompt_interpreter ||
      'Você é a primeira camada de um assistente de atendimento via WhatsApp. Leia a mensagem e decida a intenção.',
    'Responda APENAS com um JSON: {"intent": "...", "params": {...}}.',
    'Intenções: consultar_pedido, buscar_produto, orcamento_servico, agendar_servico, consultar_agendamento, cancelar_agendamento, remarcar_agendamento, duvida_loja, horario_funcionamento, encaminhar_humano, outro.',
  ].join('\n')
  const text = await completeSimple(config, system, userMessage)
  return safeParseJson<InterpreterOutput>(text, { intent: 'outro', params: {} })
}

/**
 * Preferência configurada em /meu-plano (plataforma) — quando ligada, o
 * cliente pode escolher pagar produto (+ entrega) no ato da entrega, em vez
 * de no checkout. A assistente não cria o pedido (isso acontece no checkout
 * da vitrine), mas precisa saber oferecer/confirmar a opção quando perguntada.
 */
function paymentOnDeliveryRule(): string {
  return '- O cliente pode escolher pagar o produto (+ entrega) no ato da entrega, em vez de pagar agora no checkout — existe um checkbox pra isso no checkout da vitrine. Se ele perguntar sobre formas de pagamento ou preferir não pagar agora, informe essa opção normalmente.'
}

/**
 * Pré-carrega o que já está em andamento pro telefone da conversa -- só na
 * PRIMEIRA mensagem (history vazio). Evita a IA fazer triagem do zero
 * quando o cliente já tem solicitação/agendamento/pedido ativo; ela ainda
 * pode consultar outro número explicitamente via consultar_atendimento_em_andamento
 * se o cliente disser que o atendimento dele está em outro telefone.
 */
async function hydrateOngoingContext(
  history: { role: 'user' | 'assistant'; content: string }[],
  phone?: string,
): Promise<string | null> {
  if (history.length > 0 || !phone) return null
  try {
    const summary = await consultarAtendimentoEmAndamento(phone)
    if (summary.startsWith('Nada em andamento')) return null
    return `Contexto pré-carregado (telefone desta conversa já tem algo em andamento -- NÃO faça triagem do zero, dê continuidade com base nisto):\n${summary}`
  } catch {
    return null
  }
}

async function runResponder(
  config: AssistantConfig,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  interpreterOutput: InterpreterOutput,
  conversationPhone?: string,
): Promise<{ reply: string; toolCalls: ToolCallRecord[] }> {
  const tools = await resolveTools()
  const withAgenda = tools.some((t) => AGENDA_TOOL_NAMES.includes(t.name))
  const paymentOnDeliveryEnabled = await fetchPaymentOnDeliveryEnabledServer()
  const ongoingContext = await hydrateOngoingContext(history, conversationPhone)

  const system = [
    universalRules(config, withAgenda),
    paymentOnDeliveryEnabled ? paymentOnDeliveryRule() : null,
    ongoingContext,
    // Único prompt editável pelo lojista (mesmo padrão do a-vrtek-gente):
    // contexto de negócio/tom de voz, repassado tanto pro classificador de
    // intenção (IA1) quanto pra esta camada de resposta (IA2) -- não existe
    // mais um segundo campo de prompt técnico separado.
    config.prompt_interpreter
      ? `Contexto da loja configurado pelo lojista (tom de voz, regras comerciais -- siga isso, mas NUNCA em conflito com as regras fixas acima):\n${config.prompt_interpreter}`
      : 'Você é o atendimento via WhatsApp. Seja direto, simpático e técnico quando necessário.',
    `Intenção detectada: ${JSON.stringify(interpreterOutput)}`,
    `Data e hora de agora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (use como referência para "hoje", "amanhã", "agora").`,
    'Use as ferramentas necessárias pra buscar dados reais antes de responder. Sua última mensagem de texto vai direto pro cliente.',
  ].filter(Boolean).join('\n\n')

  return completeWithTools(config, system, history, userMessage, tools, executeTool)
}

function enforcePaymentSplit(reply: string, toolCalls: ToolCallRecord[]): string {
  const chargeCall = [...toolCalls].reverse().find((t) => t.tool === 'criar_pedido_e_gerar_cobranca')
  if (!chargeCall) return reply
  const lines = chargeCall.output.trim().split('\n')
  const code = lines[lines.length - 1]?.trim()
  const isReal = !!code && (code.startsWith('000201') || code.startsWith('http'))
  if (!isReal) return reply
  if (reply.includes(MSG_SPLIT_MARKER)) {
    const idx = reply.indexOf(MSG_SPLIT_MARKER)
    return `${reply.slice(0, idx)}${MSG_SPLIT_MARKER}${code}`
  }
  const parts = reply.split(code)
  const aviso = parts.length > 1 ? parts.join(' ').trim() : reply.trim()
  return `${aviso}${MSG_SPLIT_MARKER}${code}`
}

export type PipelineResult = {
  reply: string
  interpreterOutput: InterpreterOutput
  toolCalls: ToolCallRecord[]
}

export async function runPipeline(
  config: AssistantConfig,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  conversationPhone?: string,
): Promise<PipelineResult> {
  const interpreterOutput = await runInterpreter(config, userMessage)
  const { reply, toolCalls } = await runResponder(config, history, userMessage, interpreterOutput, conversationPhone)
  return {
    reply: enforcePaymentSplit(reply || 'Desculpe, não consegui processar sua mensagem agora.', toolCalls),
    interpreterOutput,
    toolCalls,
  }
}
