import { describe, expect, it } from 'vitest'
import { decideQuoteOutcome } from './quoteDecision'

describe('decideQuoteOutcome', () => {
  it('avança sozinho quando o real é menor que o estimado', () => {
    expect(decideQuoteOutcome(100, 90)).toBe('auto_advance')
  })

  it('avança sozinho quando o real é igual ao estimado', () => {
    expect(decideQuoteOutcome(100, 100)).toBe('auto_advance')
  })

  it('espera aprovação quando o real é maior que o estimado', () => {
    expect(decideQuoteOutcome(100, 150)).toBe('needs_approval')
  })

  it('espera aprovação quando não há estimado salvo (lado seguro)', () => {
    expect(decideQuoteOutcome(null, 50)).toBe('needs_approval')
    expect(decideQuoteOutcome(undefined, 50)).toBe('needs_approval')
  })
})
