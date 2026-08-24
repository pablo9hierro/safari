import { completeSimple, completeWithTools } from './aiClient'
import { resolveTools, executeTool, consultarAtendimentoEmAndamento } from './tools'
import { AGENDA_TOOL_NAMES } from '@/lib/agenda/tools'
import { fetchPaymentOnDeliveryEnabledServer, fetchPlatformStoreConfig } from '@/lib/resolutoo/platformConfig'
import { STORE_ADDRESS } from '@/lib/constants'
import { createServiceClient } from '@/lib/supabase/service'
import { buildTrackingLink } from '@/lib/tracking'
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
    '- Se o contexto pré-carregado no início desta conversa já indicar um atendimento/pedido em andamento, é PROIBIDO perguntar aparelho, marca, modelo, qual serviço ou qual produto de novo — isso já é conhecido pelo sistema. Vá direto ao que falta pra dar continuidade (status, próxima etapa, dado que realmente falta). Perguntar de novo algo que o sistema já sabe é o pior erro possível aqui.',
    '- Se NÃO houver nada em andamento pro número desta conversa (sem contexto pré-carregado) E o cliente perguntar sobre status/andamento de algo (não uma triagem nova), pergunte antes: "esse número que você está falando é o mesmo cadastrado no seu pedido/atendimento, ou foi outro número?". Se ele indicar outro número, use consultar_atendimento_em_andamento com ESSE número e dê continuidade a partir do que for encontrado — sem repetir a triagem. Só depois de confirmar que não há nada em nenhum número é que se trata como atendimento novo.',
    '- Depois de confirmado o número, consulte o estado real (produto: consultar_pedido; serviço: consultar_meus_atendimentos) e dê continuidade dali — trate como a continuação natural do atendimento dele, não como uma conversa nova, mesmo que ele tenha vindo de outro canal.',
    '- Perguntas como "já terminou", "está pronto", "qual o problema", "quanto custa", "aprovado?" NUNCA são respondidas pela memória da conversa — rode consultar_meus_atendimentos (se ainda não souber o ID) e depois a tool específica do que foi perguntado, nesta mesma interação.',
    '- Nunca invente status, valor de orçamento, diagnóstico ou prazo de entrega. Se a ferramenta não retornar a informação, diga que ainda não está disponível.',
    '- Aprovar/recusar orçamento (aprovar_orcamento/recusar_orcamento) só depois do cliente confirmar explicitamente que aceita ou recusa o valor informado pela tool de diagnóstico — nunca decida por dedução. Frases como "pode fazer", "aceito", "pode consertar", "pode seguir" contam como aprovação explícita.',
    '- Cancelamento (cancelar_atendimento) só funciona antes da aprovação do orçamento — se a tool recusar (atendimento já aprovado/em reparo), explique que a partir dali o cancelamento depende da loja, não invente uma forma de cancelar mesmo assim.',
    '- Depois que consultar_status_atendimento (ou consultar_status_reparo) confirmar que o reparo terminou, pergunte proativamente se o cliente prefere RETIRAR na loja ou RECEBER por entrega — não espere ele perguntar. Se for entrega, confirme se o endereço é o mesmo já usado antes ou se é outro.',
    '- Entrega/retirada do aparelho (agendar_entrega_aparelho/agendar_retirada_aparelho) só pode ser AGENDADA depois que o reparo estiver concluído — confirme com consultar_status_atendimento antes se não tiver certeza. Coleta do aparelho no cliente (agendar_coleta_aparelho) pode ser agendada a qualquer momento em que o atendimento estiver ativo.',
    '- Não escreva você mesmo um link de "/consultar" — o sistema já anexa automaticamente o link de acompanhamento correto (com código de acesso) toda vez que um pedido/agendamento fecha com sucesso. Só foque em confirmar o que foi feito.',
  ].join('\n')
}

/**
 * Qualificação de aparelho/marca ANTES de sugerir produto ou serviço --
 * sem isso a IA responde com uma lista genérica que não serve pro
 * aparelho real do cliente, ou (pior, em acessórios) sugere algo
 * incompatível.
 */
function qualificationRule(): string {
  return [
    'QUALIFICAÇÃO ANTES DE SUGERIR (obrigatório):',
    '- Antes de rodar buscar_produtos ou buscar_servicos pela primeira vez numa conversa nova, confirme o aparelho e a marca (e o modelo, se o cliente souber) que o produto/serviço é PRA. Não pergunte de novo se isso já foi dito ou já está no contexto pré-carregado.',
    '- Para ACESSÓRIO (carregador, capinha, fone, cabo, película, etc.): o aparelho/modelo é ainda mais crítico, porque existe risco real de incompatibilidade. Nunca sugira um acessório sem saber o modelo do aparelho do cliente, e ao sugerir, deixe claro que é compatível com o modelo dele (não ofereça um item genérico sem confirmar).',
    '- Exceção: se o cliente já descreveu aparelho+marca+modelo na própria mensagem, não pergunte de novo — já rode a busca.',
  ].join('\n')
}

/**
 * Confirmação explícita do serviço antes de avançar pro checkout (nome,
 * telefone, coleta, agenda) -- evita a IA pular direto pra criar_agendamento
 * assim que tiver dados o bastante, sem o cliente ter realmente topado
 * aquele serviço específico.
 */
function serviceConfirmationRule(): string {
  return [
    'CONFIRMAÇÃO DE SERVIÇO ANTES DO CHECKOUT (obrigatório):',
    '- Depois de identificar/sugerir um serviço específico (via buscar_servicos), peça o cliente confirmar explicitamente que é aquele serviço que ele quer, ANTES de pedir nome, telefone, coleta ou horário. Frases como "sim", "é esse mesmo", "pode ser" contam como confirmação.',
    '- Se o cliente disser que não sabe qual serviço precisa (ou a descrição for muito vaga/genérica e buscar_servicos não achar nada com confiança real pro sintoma — confira também as tags dos serviços contra palavras usadas por ele), NÃO force uma escolha do catálogo: explique que é necessário um diagnóstico técnico pra identificar o problema e definir o preço certo. Rode buscar_servicos("diagnóstico") pra saber se a loja cobra o diagnóstico ou não, informe esse valor ao cliente, e siga o agendamento com diagnostico=true em criar_agendamento.',
    '- Só depois da confirmação do serviço (ou do diagnóstico), siga na ordem: 1) peça nome e telefone (o telefone da conversa já vale, mas confirme se é esse mesmo que deve ficar registrado) 2) pergunte se quer que a loja busque o aparelho (coleta) ou se ele mesmo leva 3) se for coleta, peça a localização pela conversa 4) consulte disponibilidade e ofereça horários (mesmo quando o cliente for levar o aparelho sozinho, o agendamento é obrigatório) 5) confirme o horário escolhido e só então chame criar_agendamento.',
    '- Deixe sempre claro: o pagamento do serviço (mais o deslocamento, quando existir e for cobrado) só acontece na CONCLUSÃO do reparo — nunca cobre nada na criação da solicitação nem durante o atendimento.',
    '- Ao apresentar o preço de um serviço sugerido pelo catálogo, deixe claro que é uma ESTIMATIVA: pode subir se o diagnóstico físico achar outro componente danificado, ou pode cair se o reparo real for mais simples (ex.: solda/jump, sem precisar trocar peça). O valor final só é confirmado depois do diagnóstico na loja.',
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
    qualificationRule(),
    '',
    serviceConfirmationRule(),
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
 * cliente pode escolher pagar produto no ato da retirada, em vez de pagar
 * agora via Pix. criar_pedido_e_gerar_cobranca cria o pedido de verdade
 * (o mesmo que aparece no painel do lojista); pagar_agora controla se o
 * Pix é gerado na hora ou se fica pendente pra retirada.
 */
function paymentOnDeliveryRule(): string {
  return '- Ao fechar a compra de produto (criar_pedido_e_gerar_cobranca), pergunte se o cliente quer pagar agora (gera Pix copia-e-cola) ou pagar na retirada — as duas opções valem aqui. Use pagar_agora conforme a escolha dele. Pedido de assistente sempre é RETIRADA na loja (não há entrega de produto por aqui ainda).'
}

/**
 * Sem deslocamento nenhum (apenas_retirada) OU quando a loja desligou
 * pagamento-na-entrega em /meu-plano: produto só pode ser pago agora
 * (Pix), nunca na retirada.
 */
function productCheckoutOnlyRule(): string {
  return '- Ao fechar a compra de produto (criar_pedido_e_gerar_cobranca), sempre use pagar_agora=true — esta loja não oferece pagar na retirada, não ofereça essa opção ao cliente.'
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

/** Endereço real da loja, configurado pelo lojista em
 * /dashboard/servicodeslocamento (shipping_settings.store_address) --
 * nunca hardcoded aqui, pra não divergir se a loja mudar de endereço.
 * STORE_ADDRESS (constants.ts) só entra como fallback se o lojista nunca
 * preencheu esse campo. */
async function fetchStoreAddressText(): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('shipping_settings').select('store_address').eq('id', 1).single()
    if (data?.store_address?.trim()) return data.store_address.trim()
  } catch {
    // cai pro fallback abaixo
  }
  return `${STORE_ADDRESS.street}, ${STORE_ADDRESS.neighborhood}, ${STORE_ADDRESS.city}`
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
  const platformConfig = await fetchPlatformStoreConfig()
  // Sem deslocamento nenhum (loja é apenas-retirada), não existe "ato da
  // entrega" pro produto ser pago -- o cliente SEMPRE leva o produto na
  // loja, então o pagamento tem que ser no checkout, nunca depois.
  const paymentOnDeliveryEnabled = !platformConfig.apenas_retirada && (await fetchPaymentOnDeliveryEnabledServer())
  const ongoingContext = await hydrateOngoingContext(history, conversationPhone)
  const storeAddressText = await fetchStoreAddressText()

  const system = [
    universalRules(config, withAgenda),
    paymentOnDeliveryEnabled ? paymentOnDeliveryRule() : productCheckoutOnlyRule(),
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
    conversationPhone
      ? `Telefone desta conversa (WhatsApp real do cliente, já confirmado pelo sistema): ${conversationPhone}. Use ESSE valor sempre que uma tool pedir cliente_telefone/telefone — NUNCA peça o número de novo nem invente um placeholder, a menos que o cliente diga explicitamente que quer usar outro número (aí use o que ele informou).`
      : null,
    `Endereço da loja (informe ao cliente quando ele escolher RETIRAR em vez de entrega/coleta): ${storeAddressText}. Mapa: ${STORE_ADDRESS.mapsUrl}`,
    '- Quando o cliente enviar uma localização pelo WhatsApp (mensagem de localização, não texto), você recebe as coordenadas reais (latitude/longitude) já extraídas dessa mensagem — use esses valores exatos em endereco_lat/endereco_lng de criar_pedido_e_gerar_cobranca. Nunca invente coordenadas.',
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

// A instrução no prompt pra sempre mandar o link de acompanhamento nem
// sempre é seguida (modelo é texto gerado, não garantido) -- reforça aqui
// de forma mecânica: se um pedido/agendamento foi fechado com sucesso
// nesta interação e a resposta final não menciona o link, anexa como
// mensagem separada. Roda DEPOIS de enforcePaymentSplit pra não interferir
// na separação do código Pix.
async function enforceTrackingLink(reply: string, toolCalls: ToolCallRecord[], phone?: string): Promise<string> {
  if (!phone) return reply
  const closed = toolCalls.some(
    (t) =>
      (t.tool === 'criar_pedido_e_gerar_cobranca' || t.tool === 'criar_agendamento') &&
      t.output.includes(t.tool === 'criar_pedido_e_gerar_cobranca' ? 'PEDIDO CRIADO' : 'AGENDAMENTO CONFIRMADO'),
  )
  if (!closed) return reply
  if (reply.includes('/consultar')) return reply
  const link = await buildTrackingLink(phone)
  return `${reply}${MSG_SPLIT_MARKER}Acompanhe por aqui: ${link}`
}

// Quando a IA sugere um serviço com preço ANTES de o aparelho ser visto de
// verdade (o normal aqui: orçamento falado por telefone/WhatsApp), o valor
// é só uma estimativa -- pode mudar pra cima (achou outro componente
// quebrado) ou pra baixo (reparo simples, tipo solda/jump, sem trocar
// peça). Confiar só no prompt pra sempre explicar isso e mandar como
// mensagem separada é frágil (texto gerado, não garantido) -- reforça aqui
// de forma mecânica, igual enforceTrackingLink. Não entra em agendamento
// de diagnóstico puro (diagnostico=true): ali ainda não existe preço
// nenhum cravado pra "poder mudar".
function enforceDiagnosisExplanation(reply: string, toolCalls: ToolCallRecord[]): string {
  const call = [...toolCalls].reverse().find(
    (t) => t.tool === 'criar_agendamento' && t.output.includes('AGENDAMENTO CONFIRMADO') && t.input?.diagnostico !== true,
  )
  if (!call) return reply
  const explanation =
    'Só um detalhe importante: esse valor é uma estimativa baseada no que você descreveu. Quando o aparelho chegar na loja, vamos abrir e fazer um diagnóstico completo — o valor final pode ficar maior (se aparecer outro componente danificado) ou menor (se for um reparo mais simples, sem precisar trocar peça). Você só paga depois que o serviço for concluído.'
  return `${reply}${MSG_SPLIT_MARKER}${explanation}`
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
  const withPayment = enforcePaymentSplit(reply || 'Desculpe, não consegui processar sua mensagem agora.', toolCalls)
  const withDiagnosisExplanation = enforceDiagnosisExplanation(withPayment, toolCalls)
  return {
    reply: await enforceTrackingLink(withDiagnosisExplanation, toolCalls, conversationPhone),
    interpreterOutput,
    toolCalls,
  }
}
