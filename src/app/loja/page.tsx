import { fetchPublicProducts } from '@/lib/resolutoo/catalog'
import { fetchPlatformStoreConfig } from '@/lib/resolutoo/platformConfig'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'
import LojaClient from './LojaClient'

// Ver comentário equivalente em catalogo-servico/page.tsx -- force-dynamic
// travava a página por minutos quando o ecommerce-api externo degradava
// (sem timeout, sem cache). fetchPublicProducts já tem revalidate+timeout.
export const revalidate = 30

export default async function LojaPage() {
  const [products, { loja_nome }] = await Promise.all([
    fetchPublicProducts(),
    fetchPlatformStoreConfig(),
  ])

  return (
    <CartProvider>
      <LojaClient initialProducts={products.sort((a, b) => a.name.localeCompare(b.name))} storeName={loja_nome} />
      <CarrinhoFlutuante />
    </CartProvider>
  )
}
