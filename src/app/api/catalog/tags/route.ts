import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { generateProductTags, generateServiceTags, type CompatContext } from '@/lib/catalogTags/generate'

type Db = ReturnType<typeof createServiceClient>

/** Aparelho(s)/marca(s)/modelo(s) vinculados ao item (many-to-many) --
 * grounding real pra IA de tags gerar frase de compatibilidade específica
 * em vez de só inventar. Produto e serviço usam tabelas de junção com
 * nomes diferentes (product_* vs service_item_*) mas o mesmo cadastro
 * mestre (device_types/service_catalog_categories/catalog_models). */
async function fetchCompat(db: Db, kind: 'product' | 'service', itemId: string): Promise<CompatContext> {
  const devicesTable = kind === 'product' ? 'product_devices' : 'service_item_devices'
  const brandsTable = kind === 'product' ? 'product_brands' : 'service_item_brands'
  const modelsTable = kind === 'product' ? 'product_models' : 'service_item_models'
  const idCol = kind === 'product' ? 'product_id' : 'service_catalog_item_id'

  const [{ data: deviceLinks }, { data: brandLinks }, { data: modelLinks }] = await Promise.all([
    db.from(devicesTable).select('device_type_id').eq(idCol, itemId),
    db.from(brandsTable).select('brand_id').eq(idCol, itemId),
    db.from(modelsTable).select('model_id').eq(idCol, itemId),
  ])

  const deviceIds = (deviceLinks ?? []).map((l: { device_type_id: string }) => l.device_type_id)
  const brandIds = (brandLinks ?? []).map((l: { brand_id: string }) => l.brand_id)
  const modelIds = (modelLinks ?? []).map((l: { model_id: string }) => l.model_id)

  const [{ data: devices }, { data: brands }, { data: models }] = await Promise.all([
    deviceIds.length > 0 ? db.from('device_types').select('name').in('id', deviceIds) : Promise.resolve({ data: [] }),
    brandIds.length > 0 ? db.from('service_catalog_categories').select('name').in('id', brandIds) : Promise.resolve({ data: [] }),
    modelIds.length > 0 ? db.from('catalog_models').select('name').in('id', modelIds) : Promise.resolve({ data: [] }),
  ])

  return {
    devices: (devices ?? []).map((d: { name: string }) => d.name),
    brands: (brands ?? []).map((b: { name: string }) => b.name),
    models: (models ?? []).map((m: { name: string }) => m.name),
  }
}

/**
 * POST /api/catalog/tags — gera (via IA) e salva as tags de busca de um
 * produto ou serviço recém-cadastrado. Chamado pelo painel logo depois do
 * INSERT direto no Supabase (cadastro continua client-side como já era;
 * só a geração de tags precisa rodar aqui porque depende da chave de IA,
 * que nunca fica exposta ao browser).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const type = body.type as 'product' | 'service'
    const id = String(body.id ?? '')
    if (!id || (type !== 'product' && type !== 'service')) {
      return NextResponse.json({ error: 'Informe type ("product"|"service") e id.' }, { status: 400 })
    }

    const db = createServiceClient()

    if (type === 'product') {
      const { data, error } = await db.from('products').select('id, name, description').eq('id', id).maybeSingle()
      if (error || !data) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
      const compat = await fetchCompat(db, 'product', id)
      const tags = await generateProductTags(data.name, data.description, compat)
      await db.from('products').update({ tags }).eq('id', id)
      return NextResponse.json({ tags })
    }

    const { data, error } = await db
      .from('service_catalog_items')
      .select('id, model_name, repair_type, description')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })
    const compat = await fetchCompat(db, 'service', id)
    const tags = await generateServiceTags(data.model_name, data.repair_type, data.description, compat)
    await db.from('service_catalog_items').update({ tags }).eq('id', id)
    return NextResponse.json({ tags })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
