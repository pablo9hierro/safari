import { redirect } from 'next/navigation'
import { createResolutooAuthServerClient } from '@/lib/supabase/resolutooAuthServer'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // redirect() precisa ficar FORA do try/catch: ele funciona lançando um
  // erro interno especial (digest "NEXT_REDIRECT") que o Next.js intercepta
  // no boundary certo pra fazer o redirect de verdade. Um try/catch por
  // fora captura esse "erro" como se fosse um crash real e renderiza texto
  // cru na tela em vez de redirecionar (achado real: era exatamente isso
  // que quebrava /dashboard sem sessão, incluindo via proxy de
  // resolutoo.com/loja/eletronica-admin — o catch escondia o redirect).
  let user: Awaited<ReturnType<Awaited<ReturnType<typeof createResolutooAuthServerClient>>['auth']['getUser']>>['data']['user'] | null = null
  try {
    const supabase = await createResolutooAuthServerClient()
    const res = await supabase.auth.getUser()
    user = res.data.user
    if (res.error) user = null
  } catch (err) {
    return <pre className="text-red-400 p-8 text-xs">DashboardLayout crash: {String(err)}</pre>
  }

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-vr-black md:flex">
      <DashboardSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
