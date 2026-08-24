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

/** Produto único por ID -- mesma fonte de fetchPublicProducts (ecommerce-api),
 * usado por /loja/[id]. Os IDs que a listagem/vitrine/IA usam são desse
 * catálogo, não do Supabase do vrtech -- ver decisão de arquitetura em
 * assistantOrder.ts. */
export async function fetchPublicProduct(id: string): Promise<Product | null> {
  try {
    const res = await fetch(`${ECOMMERCE_API_URL}/api/public/catalog/${TENANT_SLUG}/products/${id}`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data: EcommerceProductDto = await res.json()
    if (!data.active) return null
    return toProduct(data)
  } catch {
    return null
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
  /** null = serviço universal da marca -- vale pra qualquer modelo, ver
   * agrupamento em CatalogoClient. */
  model_name: string | null
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

/**
 * Catálogo de SERVIÇOS (reparo) vem do Supabase do próprio vrtech
 * (service_catalog_categories/service_catalog_items) -- é o admin em
 * /dashboard/catalogo que escreve ali, e é dessa mesma fonte que o wizard
 * de orçamento (ServiceRequestForm) já lê ao vivo (via client, RLS anon).
 * Achado real: esta função lia do ecommerce-api (motor de PRODUTOS, outra
 * base), que nunca teve dado de serviço pra nenhum tenant -- catálogo
 * público sempre vinha vazio ("catálogo em construção") mesmo com o
 * lojista tendo cadastrado dezenas de serviços reais no dashboard.
 */
export async function fetchServiceCatalog(): Promise<{ categories: CatalogCategory[]; items: CatalogItem[] }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  type RawCategory = { id: string; name: string; slug: string; sort_order: number; image_url: string | null }
  type RawItem = {
    id: string; category_id: string; model_name: string | null; repair_type: string
    price: number; description: string | null; sort_order: number; active: boolean; tags?: string[]
  }
  let rawCategories: RawCategory[] = []
  let rawItems: RawItem[] = []
  try {
    const supabase = createServiceClient()
    const [{ data: cats }, { data: svcItems }] = await Promise.all([
      supabase.from('service_catalog_categories').select('*').order('sort_order'),
      supabase.from('service_catalog_items').select('*').eq('active', true).order('sort_order'),
    ])
    rawCategories = (cats ?? []) as RawCategory[]
    rawItems = (svcItems ?? []) as RawItem[]
  } catch {
    // Falha de conexão -- cai pro fallback vazio (página mostra "catálogo
    // em construção") em vez de travar o carregamento da página.
  }

  // Só entram categorias que realmente têm algum serviço ativo cadastrado.
  const categories: CatalogCategory[] = rawCategories
    .filter((c) => rawItems.some((i) => i.category_id === c.id))
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, sort_order: c.sort_order, image_url: c.image_url }))

  const items: CatalogItem[] = rawItems.map((i) => ({
    id: i.id,
    category_id: i.category_id,
    model_name: i.model_name,
    repair_type: i.repair_type,
    price: i.price,
    description: i.description,
    image_url: null,
    sort_order: i.sort_order,
    tags: i.tags,
  }))

  return { categories, items }
}
