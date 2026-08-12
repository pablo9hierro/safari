import { redirect } from 'next/navigation'
import { createResolutooAuthServerClient } from '@/lib/supabase/resolutooAuthServer'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = await createResolutooAuthServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) return <pre className="text-red-400 p-8 text-xs">auth.getUser error: {JSON.stringify(error)}</pre>
    if (!user) redirect('/login')

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
