/**
 * Regra de negócio: orçamento real (pós-diagnóstico) <= orçamento estimado
 * (falado de boca na coleta) -> avança pro reparo sozinho, sem perguntar
 * pro cliente. Real maior que o estimado -> precisa da aprovação do
 * cliente. Sem estimado salvo (caso de borda, nunca devia acontecer já que
 * o avanço pra diagnóstico exige o campo preenchido) -> decide pelo lado
 * seguro, sempre pede aprovação em vez de arriscar cobrar sem avisar.
 */
export type QuoteOutcome = 'auto_advance' | 'needs_approval'

export function decideQuoteOutcome(estimated: number | null | undefined, real: number): QuoteOutcome {
  if (estimated == null) return 'needs_approval'
  return real <= estimated ? 'auto_advance' : 'needs_approval'
}
