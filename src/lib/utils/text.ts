/** Só a primeira letra da string inteira em maiúscula -- não é title-case
 * (evita capitalizar cada palavra, que quebraria siglas/conectores). */
export function capitalizeFirst(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}
