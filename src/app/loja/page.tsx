import { fetchPublicProducts } from '@/lib/resolutoo/catalog'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'
import LojaClient from './LojaClient'

export const dynamic = 'force-dynamic'

export default async function LojaPage() {
  const products = await fetchPublicProducts()

  return (
    <CartProvider>
      <LojaClient initialProducts={products.sort((a, b) => a.name.localeCompare(b.name))} />
      <CarrinhoFlutuante />
    </CartProvider>
  )
}
