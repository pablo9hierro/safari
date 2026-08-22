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
  tags?: string[]
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
    tags: dto.tags,
  }
}

// `no-store` forçava toda visita da vitrine a esperar um round-trip novo
// pro ecommerce-api (Railway) sem timeout nenhum -- se aquele serviço
// degradar/ficar lento, a página inteira travava por minutos (achado
// real, reportado ao vivo). `revalidate: 30` mantém o catálogo essencialmente
// ao vivo (30s de defasagem no pior caso) mas serve do cache pra maioria
// das visitas, e o timeout garante que uma resposta lenta nunca segura a
// página -- cai pro fallback (array vazio) em vez de pendurar.
const FETCH_TIMEOUT_MS = 8000

export async function fetchPublicProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/products`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const data: EcommerceProductDto[] = await res.json()
    return data.filter((p) => p.active).map(toProduct)
  } catch {
    return []
  }
}

// ─── Catálogo de serviços (reparo) ──────────────────────────────────────

export type CatalogCategoryApi = { id: string; name: string }

type EcommerceServiceDto = {
  id: string
  name: string
  description: string
  category_name: string | null
  price: number
  available_quantity: number | null
  model_name: string | null
  repair_type: string | null
  tags?: string[]
}

export type CatalogCategory = {
  id: string
  name: string
  slug: string
  sort_order: number
  image_url: string | null
}

export type CatalogItem = {
  id: string
  category_id: string
  model_name: string
  repair_type: string
  price: number
  description: string | null
  image_url: string | null
  sort_order: number
  tags?: string[]
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function fetchServiceCatalog(): Promise<{ categories: CatalogCategory[]; items: CatalogItem[] }> {
  let rawCategories: CatalogCategoryApi[] = []
  let rawServices: EcommerceServiceDto[] = []
  try {
    const [categoriesRes, servicesRes] = await Promise.all([
      fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/categories`, {
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
      fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/services`, {
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    ])
    rawCategories = categoriesRes.ok ? await categoriesRes.json() : []
    rawServices = servicesRes.ok ? await servicesRes.json() : []
  } catch {
    // Timeout ou API fora do ar -- cai pro fallback vazio (página mostra
    // "catálogo em construção") em vez de travar o carregamento da página.
  }

  // Categoria = marca do aparelho — só entram categorias que realmente têm
  // algum serviço com model_name/repair_type preenchido (catálogo de reparo).
  const categoryIdByName = new Map(rawCategories.map((c) => [c.name, c.id] as const))
  const categories: CatalogCategory[] = rawCategories
    .filter((c) => rawServices.some((s) => s.category_name === c.name && s.model_name && s.repair_type))
    .map((c, i) => ({ id: c.id, name: c.name, slug: slugify(c.name), sort_order: i, image_url: null }))

  const items: CatalogItem[] = rawServices
    .filter((s) => s.model_name && s.repair_type && s.category_name)
    .map((s, i) => ({
      id: s.id,
      category_id: categoryIdByName.get(s.category_name!) ?? '',
      model_name: s.model_name!,
      repair_type: s.repair_type!,
      price: s.price,
      description: s.description || null,
      image_url: null,
      sort_order: i,
      tags: s.tags,
    }))

  return { categories, items }
}
