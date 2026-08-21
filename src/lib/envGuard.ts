/**
 * Vercel às vezes poluí o build com o placeholder LITERAL "[SENSITIVE]" no
 * lugar do valor real de uma env var (visto em produção, causa raiz de
 * vários "crash"/"não funciona" -- ver platformCredentials.ts pro caso
 * mais crítico). É uma string não-vazia, então `??`/`||` contra fallback
 * nunca pega esse caso. Todo `process.env.NEXT_PUBLIC_*` com fallback
 * deve passar por aqui em vez de `??`/`||` puro.
 */
export function envOr(value: string | undefined, fallback: string): string {
  return !value || value === '[SENSITIVE]' ? fallback : value
}
