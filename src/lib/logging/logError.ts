/**
 * Logger central pro módulo de rastreamento de erros (vrtech.error_log,
 * aba "Erros" em /dashboard/relatorios). Fire-and-forget via fetch direto
 * na REST API do Supabase (não o SDK) -- precisa funcionar tanto em rotas
 * normais (Node runtime) quanto no middleware (Edge runtime), e o SDK traz
 * overhead/estado que não vale a pena só pra um insert isolado.
 *
 * Best-effort: nunca lança, nunca atrasa a resposta real. Um erro ao
 * registrar o erro não pode virar um segundo erro.
 */
export type ErrorLogSource = 'middleware' | 'api' | 'client' | 'webhook'

export function logError(
  source: ErrorLogSource,
  message: string,
  context?: { route?: string; [key: string]: unknown },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return

  const { route, ...rest } = context ?? {}

  fetch(`${url}/rest/v1/error_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': 'vrtech',
      'Content-Profile': 'vrtech',
    },
    body: JSON.stringify({
      source,
      level: 'error',
      message,
      route: route ?? null,
      context: Object.keys(rest).length > 0 ? rest : null,
    }),
  }).catch(() => {})
}
