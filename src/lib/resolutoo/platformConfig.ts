// Config da loja que vive na PLATAFORMA (/meu-plano), não no Supabase do
// vrtech — mesmo endpoint público usado por checkout.ts, mas sem 'use client'
// pra poder ser chamado de código server-side (ex: pipeline.ts da assistente).
import { envOr } from '@/lib/envGuard'

const RESOLUTOO_API_URL = envOr(process.env.NEXT_PUBLIC_RESOLUTOO_API_URL, 'https://ufersin-api-production.up.railway.app')
const TENANT_SLUG = envOr(process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG, 'vrtech')

export type PlatformStoreConfig = {
  /** Loja não faz deslocamento nenhum: sem coleta, sem entrega de produto, sem entrega de aparelho reparado. */
  apenas_retirada: boolean
  /** Coleta do aparelho a reparar é cortesia (não cobra o frete de ida). */
  coleta_gratis: boolean
  /** Entrega do aparelho já reparado é cortesia (não cobra o frete de volta). */
  entrega_reparado_gratis: boolean
  /** Cliente pode escolher pagar produto (+ entrega) no ato da entrega. */
  pagamento_na_retirada: boolean
  /** Nome da loja cadastrado em /onboarding + editável em /meu-plano/layout. */
  loja_nome: string | null
  /** Logo enviada em /meu-plano/layout -- null se o lojista nunca subiu uma. */
  logo_url: string | null
}

const FALLBACK: PlatformStoreConfig = {
  // Fail-safe conservador: na dúvida (rede fora, loja não encontrada), assume
  // o comportamento COMPLETO -- oferece deslocamento e cobra normalmente.
  // Errar pro lado de "cobrou o frete" é recuperável; errar pro lado de
  // "prometeu entrega grátis que a loja não faz" não é.
  apenas_retirada: false,
  coleta_gratis: false,
  entrega_reparado_gratis: false,
  pagamento_na_retirada: false,
  loja_nome: null,
  logo_url: null,
}

/**
 * Lê as preferências da loja no endpoint público da plataforma. Cache de 60s
 * (revalidate) — mudança em /meu-plano reflete aqui em no máximo 1 minuto.
 */
export async function fetchPlatformStoreConfig(): Promise<PlatformStoreConfig> {
  try {
    const res = await fetch(`${RESOLUTOO_API_URL}/api/public/tenant-config/${TENANT_SLUG}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return FALLBACK
    const data = await res.json()
    const apenasRetirada = !!data.apenas_retirada
    return {
      apenas_retirada: apenasRetirada,
      // Loja sem deslocamento não tem cortesia de deslocamento a oferecer —
      // normalizado aqui também (o backend já normaliza, isto é cinto e
      // suspensório contra config legada inconsistente).
      coleta_gratis: !apenasRetirada && !!data.coleta_gratis,
      entrega_reparado_gratis: !apenasRetirada && !!data.entrega_reparado_gratis,
      pagamento_na_retirada: !!data.pagamento_na_retirada,
      loja_nome: data.loja_nome || null,
      logo_url: data.logo_url || null,
    }
  } catch {
    return FALLBACK
  }
}

/**
 * Cliente pode escolher pagar no ato da entrega/retirada.
 *
 * Lia `data.pagamento_produto_na_entrega` — campo que NUNCA existiu no
 * `tenant-config` (o real é `pagamento_na_retirada`), então isto retornava
 * `false` para todo mundo desde sempre, silenciosamente. Corrigido junto
 * com a introdução das preferências de deslocamento.
 */
export async function fetchPaymentOnDeliveryEnabledServer(): Promise<boolean> {
  return (await fetchPlatformStoreConfig()).pagamento_na_retirada
}

export async function fetchApenasRetiradaServer(): Promise<boolean> {
  return (await fetchPlatformStoreConfig()).apenas_retirada
}
