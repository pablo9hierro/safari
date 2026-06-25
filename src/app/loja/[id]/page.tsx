import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductDetailClient from './ProductDetailClient'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle()

  if (!product) notFound()

  return <ProductDetailClient product={product} />
}
