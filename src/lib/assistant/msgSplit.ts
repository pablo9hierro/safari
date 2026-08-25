// Marcador de "vira mensagem separada do WhatsApp" -- usado tanto no lado
// de saída (pipeline.ts, split final antes de enviar) quanto no texto que
// as próprias tools já devolvem pré-formatado (ex.: consultar_atendimento_em_andamento),
// pra quem consome (deliverReliable) sempre reconhecer o mesmo marcador.
// Extraído num arquivo à parte porque tools.ts não pode importar de
// pipeline.ts (pipeline.ts já importa de tools.ts -- ciclo).
export const MSG_SPLIT_MARKER = '|||MSG_SPLIT|||'
