import { redirect } from 'next/navigation'

/** /dashboard/financeiro virou /dashboard/relatorios -- mantido como
 * redirect pra não quebrar favoritos/links antigos. */
export default function FinanceiroRedirectPage() {
  redirect('/dashboard/relatorios')
}
