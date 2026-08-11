// Catálogo (produtos/serviços) compartilhado do Resolutoo — o vrtech não
// tem mais tabela própria de produtos/serviços, consome direto o motor
// ecommerce-api (mesma API que qualquer outro tenant do Resolutoo usa).
import type { Product } from '@/lib/types'

const ECOMMERCE_API_URL = process.env.ECOMMERCE_API_URL ?? 'https://ecommerce-api-production-d447.up.railway.app'
const TENANT_SLUG = process.env.ECOMMERCE_TENANT_SLUG ?? 'vrtech'

type EcommerceProductDto = {
  id: string
  name: string
  description: string | null
  price: number
  quantity: number
  image_url: string | null
  category_id: string | null
  category_name: string | null
  active: boolean
  phone_brand: string | null
  phone_model: string | null
}

function toProduct(dto: EcommerceProductDto): Product {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    price: dto.price,
    quantity: dto.quantity,
    category_id: dto.category_id,
    phone_brand: dto.phone_brand,
    phone_model: dto.phone_model,
    image_url: dto.image_url,
    active: dto.active,
    created_at: '',
    updated_at: '',
    product_categories: dto.category_name ? { name: dto.category_name } : null,
  }
}

export async function fetchPublicProducts(): Promise<Product[]> {
  const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/products`, {
    cache: 'no-store',
  })
  if (!res.ok) return []
  const data: EcommerceProductDto[] = await res.json()
  return data.filter((p) => p.active).map(toProduct)
}
