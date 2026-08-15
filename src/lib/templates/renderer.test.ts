import { describe, it, expect } from 'vitest'
import { extractVariables, missingRequiredVariables, renderTemplate, previewTemplate } from './renderer'

describe('extração de variáveis', () => {
  it('encontra todas as variáveis no formato /nome', () => {
    expect(extractVariables('Olá, /nome! Pedido #/pedido de /valor.')).toEqual([
      '/nome', '/pedido', '/valor',
    ])
  })

  it('não duplica variável repetida', () => {
    expect(extractVariables('/nome, /nome, /nome')).toEqual(['/nome'])
  })

  it('URL com /variavel no fim ainda é reconhecida como variável', () => {
    // A regex captura qualquer /palavra — inclusive dentro de uma URL, o que
    // é aceitável: um template com ".../consultar/pedido" teria "/consultar"
    // e "/pedido" extraídos, mas nenhum template real do catálogo tem URL
    // fixa com variável embutida — os links (/link_os etc.) são eles mesmos
    // a variável inteira.
    expect(extractVariables('Acompanhe em /link_acompanhamento')).toEqual(['/link_acompanhamento'])
  })

  it('texto sem variáveis retorna lista vazia', () => {
    expect(extractVariables('Mensagem fixa sem variáveis.')).toEqual([])
  })
})

describe('renderização', () => {
  it('substitui todas as variáveis presentes', () => {
    const out = renderTemplate('Olá, /nome! Pedido #/pedido.', { nome: 'João', pedido: '4821' })
    expect(out).toBe('Olá, João! Pedido #4821.')
  })

  it('aceita a variável com ou sem a barra na chave de entrada', () => {
    const a = renderTemplate('Olá, /nome!', { nome: 'Maria' })
    const b = renderTemplate('Olá, /nome!', { '/nome': 'Maria' })
    expect(a).toBe(b)
  })

  it('variável sem valor correspondente é removida, não aparece crua', () => {
    const out = renderTemplate('Olá, /nome! Seu pedido /pedido chegou.', { nome: 'João' })
    expect(out).not.toContain('/pedido')
    expect(out).toContain('João')
  })

  it('é indiferente a maiúsculas na variável', () => {
    expect(renderTemplate('Olá, /Nome!', { nome: 'Ana' })).toBe('Olá, Ana!')
  })

  it('compacta espaços e linhas sobrando de variáveis vazias', () => {
    const out = renderTemplate('Linha 1\n\n\n\nLinha 2', {})
    expect(out).toBe('Linha 1\n\nLinha 2')
  })
})

describe('validação de variáveis obrigatórias', () => {
  it('sem faltantes quando todas as obrigatórias aparecem no texto', () => {
    expect(missingRequiredVariables('Olá, /nome! Total: /valor', ['/nome', '/valor'])).toEqual([])
  })

  it('acusa a variável obrigatória ausente', () => {
    expect(missingRequiredVariables('Mensagem sem nome nenhum.', ['/nome'])).toEqual(['/nome'])
  })

  it('aceita required declarado sem a barra', () => {
    expect(missingRequiredVariables('Olá, /nome!', ['nome'])).toEqual([])
  })

  it('sem variáveis obrigatórias, qualquer texto é válido', () => {
    expect(missingRequiredVariables('Qualquer coisa.', [])).toEqual([])
  })
})

describe('preview e renderização real usam a mesma função', () => {
  it('preview aplica os valores de demonstração', () => {
    const out = previewTemplate('Olá, /nome! Seu /aparelho ficou pronto.')
    expect(out).toBe('Olá, João! Seu iPhone 13 ficou pronto.')
  })

  it('preview e renderTemplate produzem o mesmo resultado pros mesmos valores', () => {
    const content = 'Olá, /nome!'
    const viaPreview = previewTemplate(content)
    const viaRender = renderTemplate(content, { nome: 'João' })
    expect(viaPreview).toBe(viaRender)
  })
})
