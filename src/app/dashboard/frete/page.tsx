import { createClient } from '@/lib/supabase/server'
import FreteClient from './FreteClient'

export default async function FretePage() {
  const supabase = await createClient()

  const { data: rates } = await supabase
    .from('neighborhood_shipping_rates')
    .select('*')
    .order('neighborhood')

  return <FreteClient initialRates={rates ?? []} />
}
