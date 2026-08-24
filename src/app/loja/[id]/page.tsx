import { notFound } from 'next/navigation'
import { fetchPublicProduct } from '@/lib/resolutoo/catalog'
import ProductDetailClient from './ProductDetailClient'

// Antes lia direto o Supabase do vrtech (catálogo próprio, desconectado do
// que a vitrine realmente vende) -- IDs que os cards da listagem geram
// (fetchPublicProducts) vêm do ecommerce-api, então essa página sempre
// devolvia notFound() pra qualquer produto real clicado na vitrine. Ver
// decisão de arquitetura registrada em assistantOrder.ts.
export const revalidate = 30

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await fetchPublicProduct(id)
  if (!product) notFound()

  return <ProductDetailClient product={product} />
}
