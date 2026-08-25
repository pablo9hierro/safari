import { envOr } from '@/lib/envGuard'

// Espelha um produto/serviço cadastrado no painel do vrtech (Supabase
// próprio) pro catálogo público REAL (ecommerce-api) -- vitrine, PDV
// online e a busca da IA (buscar_produtos/buscar_servicos) leem só desse
// catálogo, nunca do Supabase do vrtech (ver decisão de arquitetura em
// assistantOrder.ts). Sem essa chamada, tudo cadastrado aqui fica preso
// no painel interno e nunca aparece pro cliente -- endpoint já existia no
// backend (POST /internal/catalog-sync), só nunca tinha caller de verdade.
// Best-effort de propósito (rede/serviço fora do ar não pode travar o
// cadastro no painel): falha aqui vira log, nunca erro pro lojista.
const ECOMMERCE_API_URL = envOr(process.env.ECOMMERCE_API_URL, 'https://ecommerce-api-production-d447.up.railway.app')
const TENANT_SLUG = envOr(process.env.ECOMMERCE_TENANT_SLUG, 'vrtech')

export type CatalogSyncInput = {
  kind: 'product' | 'service'
  sourceId: string
  name: string
  description?: string | null
  price: number
  quantity?: number | null
  imageUrl?: string | null
  categoryName?: string | null
  phoneBrand?: string | null
  phoneModel?: string | null
  modelName?: string | null
  repairType?: string | null
  tags: string[]
}

export async function syncCatalogItem(input: CatalogSyncInput): Promise<void> {
  const internalKey = process.env.INTERNAL_API_KEY
  if (!internalKey) return

  try {
    await fetch(`${ECOMMERCE_API_URL}/internal/catalog-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        kind: input.kind,
        source_id: input.sourceId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        quantity: input.quantity ?? null,
        image_url: input.imageUrl ?? null,
        category_name: input.categoryName ?? null,
        phone_brand: input.phoneBrand ?? null,
        phone_model: input.phoneModel ?? null,
        model_name: input.modelName ?? null,
        repair_type: input.repairType ?? null,
        tags: input.tags,
      }),
    })
  } catch (e) {
    console.error('[catalogSync] falhou:', e instanceof Error ? e.message : e)
  }
}
