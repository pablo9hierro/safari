import { createClient } from '@/lib/supabase/server'
import { fetchApenasRetiradaServer } from '@/lib/resolutoo/platformConfig'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: requests }, apenasRetirada] = await Promise.all([
    supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
    fetchApenasRetiradaServer(),
  ])

  return <DashboardClient initialRequests={requests ?? []} apenasRetirada={apenasRetirada} />
}
