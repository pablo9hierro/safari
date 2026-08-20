import { redirect } from 'next/navigation'
import { adminRedirectTarget } from '@/lib/serverProxy'

export default async function CatalogoPage() {
  redirect(await adminRedirectTarget('/dashboard/produtos'))
}
