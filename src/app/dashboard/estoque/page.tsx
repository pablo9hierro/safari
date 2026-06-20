import { createClient } from '@/lib/supabase/server'
import EstoqueClient from './EstoqueClient'

export default async function EstoquePage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('stock_items')
    .select('*')
    .order('name')

  const { data: movements } = await supabase
    .from('stock_movements')
    .select('*, stock_items(name, unit)')
    .order('moved_at', { ascending: false })
    .limit(50)

  return <EstoqueClient initialItems={items ?? []} initialMovements={movements ?? []} />
}
