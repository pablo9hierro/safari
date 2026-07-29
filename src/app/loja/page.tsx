import { createClient } from '@/lib/supabase/server'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'
import LojaClient from './LojaClient'

export const dynamic = 'force-dynamic'

export default async function LojaPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .eq('active', true)
    .order('name')

  return (
    <CartProvider>
      <LojaClient initialProducts={products ?? []} />
      <CarrinhoFlutuante />
    </CartProvider>
  )
}
