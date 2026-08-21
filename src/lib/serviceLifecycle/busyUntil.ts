import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cálculo do timer de bancada -- dois relógios separados (decisão do dono):
 * diagnóstico usa a duração do serviço "Diagnóstico" cadastrado no catálogo
 * (categoria slug='diagnostico', seedado com 30min); reparo usa a soma da
 * duração dos serviços selecionados de verdade. Extraído de
 * RequestDetailModal.tsx pra ser chamado também por DiagnosticSection.tsx
 * (auto-avanço pós-diagnóstico) e store.ts (aprovação via IA/WhatsApp) sem
 * duplicar a regra em três lugares. Só faz SELECT em `service_catalog_items`
 * (RLS permite leitura anônima) -- funciona tanto com o client do browser
 * quanto com o client de serviço (server).
 */
export async function computeDiagnosisBusyUntil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
): Promise<string> {
  const { data: diag } = await db
    .from('service_catalog_items')
    .select('duration_minutes')
    .eq('repair_type', 'Diagnóstico')
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  const minutes = diag?.duration_minutes ?? 30
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

export async function computeRepairBusyUntil(
  serviceIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
): Promise<string> {
  let minutes = 60
  if (serviceIds.length > 0) {
    const { data: services } = await db
      .from('service_catalog_items')
      .select('duration_minutes')
      .in('id', serviceIds)
    if (services && services.length > 0) {
      minutes = services.reduce((sum: number, s: { duration_minutes: number }) => sum + s.duration_minutes, 0)
    }
  }
  return new Date(Date.now() + minutes * 60_000).toISOString()
}
