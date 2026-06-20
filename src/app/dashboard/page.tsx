import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: requests } = await supabase
    .from('service_requests')
    .select('*')
    .order('created_at', { ascending: false })

  return <DashboardClient initialRequests={requests ?? []} />
}
