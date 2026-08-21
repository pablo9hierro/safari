import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agenda/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { generateProductTags, generateServiceTags } from '@/lib/catalogTags/generate'

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
      const tags = await generateProductTags(data.name, data.description)
      await db.from('products').update({ tags }).eq('id', id)
      return NextResponse.json({ tags })
    }

    const { data, error } = await db
      .from('service_catalog_items')
      .select('id, model_name, repair_type, description')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })
    const tags = await generateServiceTags(data.model_name, data.repair_type, data.description)
    await db.from('service_catalog_items').update({ tags }).eq('id', id)
    return NextResponse.json({ tags })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
