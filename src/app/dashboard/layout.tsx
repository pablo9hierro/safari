import { redirect } from 'next/navigation'
import { createResolutooAuthServerClient } from '@/lib/supabase/resolutooAuthServer'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = await createResolutooAuthServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    // Sem sessão (cookie ausente/expirado) é o caso NORMAL de visitante não
    // logado, não uma falha real — supabase-js sempre devolve
    // AuthSessionMissingError nesse caso, não é exceção. Mandar pro login
    // igual ao caso !user, nunca vazar o erro cru na tela (achado real:
    // acontecia sempre que /dashboard era acessado sem sessão, incluindo
    // pelo proxy de resolutoo.com/loja/eletronica-admin).
    if (error || !user) redirect('/login')

    return (
      <div className="min-h-screen bg-vr-black md:flex">
        <DashboardSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    )
  } catch (err) {
    return <pre className="text-red-400 p-8 text-xs">DashboardLayout crash: {String(err)}</pre>
  }
}
