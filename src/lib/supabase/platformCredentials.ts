/**
 * Fallback hardcoded pra quando `process.env.NEXT_PUBLIC_RESOLUTOO_*` vem
 * vazio em produção mesmo configurado no dashboard da Vercel -- causa raiz
 * real (confirmada via `vercel ls --prod`): deploys automáticos por push
 * reusam cache remoto de build por padrão, e esse cache não garante
 * invalidação determinística quando SÓ uma env var muda sem nenhum
 * arquivo-fonte mudar junto -- o bundle (client, servidor e Edge Runtime)
 * pode reinlinar o valor antigo/vazio de uma var criada depois do cache
 * existir. Não é segredo: são NEXT_PUBLIC_* (anon key pública por design,
 * protegida por RLS do lado do Supabase, já visível em qualquer bundle
 * client-side de qualquer forma). Se a plataforma rotacionar essas
 * credenciais, atualizar os DOIS lugares -- a env var na Vercel E as
 * constantes abaixo.
 *
 * Usado por todo lugar que precisa das credenciais do Supabase da
 * PLATAFORMA (Resolutoo) -- middleware, resolutooAuthServer, resolutooAuthClient.
 */
const URL_FALLBACK = 'https://migkkrwzykpztrakbfij.supabase.co'
const ANON_KEY_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2trcnd6eWtwenRyYWtiZmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjI2OTQsImV4cCI6MjA5MTUzODY5NH0.0bEy_WikqnfPU9eV7wusSb757dhiTiK5D2KeDSWyJTo'

export function platformSupabaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL
  return env?.startsWith('http') ? env : URL_FALLBACK
}

export function platformSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_ANON_KEY || ANON_KEY_FALLBACK
}
