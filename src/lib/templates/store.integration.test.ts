/**
 * Integração real: valida contra o Supabase de produção do vrtech as duas
 * regras críticas do Template Zap — o template de pagamento é protegido no
 * servidor (não só no frontend), e variável obrigatória ausente bloqueia o
 * salvamento. Opt-in via RUN_LIVE=1. Restaura o conteúdo original ao final.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { getTemplate, updateTemplate, listTemplates, renderMessage, TemplateError } from './store'

const live = process.env.RUN_LIVE === '1'

describe.skipIf(!live)('Template Zap contra o banco real', () => {
  let originalContent: string | null = null

  afterAll(async () => {
    if (originalContent === null) return
    const db = createServiceClient()
    await db
      .from('whatsapp_templates')
      .update({ content: originalContent })
      .eq('tenant_id', 'vrtech')
      .eq('template_key', 'status_rejected')
  })

  it('a migração populou os 19 templates reais', async () => {
    const all = await listTemplates()
    expect(all.length).toBeGreaterThanOrEqual(19)
    const keys = all.map((t) => t.template_key)
    expect(keys).toContain('status_completed')
    expect(keys).toContain('appointment_created')
    expect(keys).toContain('payment_link')
  })

  it('o template de pagamento nasceu marcado como não editável', async () => {
    const tpl = await getTemplate('payment_link')
    expect(tpl?.editable).toBe(false)
    expect(tpl?.required_variables).toContain('/link_pagamento')
  })

  it('recusa editar o template protegido, mesmo sem passar pela UI', async () => {
    const err = await updateTemplate('payment_link', { content: 'Texto substituído' }).catch((e) => e)
    expect(err).toBeInstanceOf(TemplateError)
    expect(err.code).toBe('not_editable')

    // Confirma que nada mudou de fato no banco.
    const after = await getTemplate('payment_link')
    expect(after?.content).not.toBe('Texto substituído')
  })

  it('recusa salvar template editável sem a variável obrigatória', async () => {
    const tpl = await getTemplate('status_rejected')
    originalContent = tpl!.content

    const err = await updateTemplate('status_rejected', { content: 'Mensagem sem a variável.' }).catch((e) => e)
    expect(err).toBeInstanceOf(TemplateError)
    expect(err.code).toBe('missing_variables')
    expect(err.message).toContain('/nome')
  })

  it('salva normalmente quando a variável obrigatória está presente', async () => {
    const updated = await updateTemplate('status_rejected', {
      content: 'Combinado, /nome! Qualquer coisa é só chamar.',
    })
    expect(updated.content).toContain('/nome')
  })

  it('renderMessage usa o template salvo, não mais o fallback hardcoded', async () => {
    const text = await renderMessage(
      'status_rejected',
      { nome: 'Cliente Teste' },
      'TEXTO_FALLBACK_ANTIGO',
    )
    expect(text).toContain('Cliente Teste')
    expect(text).not.toContain('TEXTO_FALLBACK_ANTIGO')
  })

  it('renderMessage cai no fallback quando o template não existe', async () => {
    const text = await renderMessage('chave_que_nao_existe', {}, 'TEXTO_FALLBACK')
    expect(text).toBe('TEXTO_FALLBACK')
  })
})
