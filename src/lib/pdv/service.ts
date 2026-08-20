import { createServiceClient } from '@/lib/supabase/service'
import { PdvError, type PdvItemType, type PdvPayment, type PdvPaymentMethod, type PdvSale, type PdvSaleItem, type PdvSaleWithDetails } from './types'

type Db = ReturnType<typeof createServiceClient>

export type CreateSaleItemInput = {
  item_type: PdvItemType
  product_id?: string | null
  service_id?: string | null
  quantity: number
}

/**
 * Abre uma venda com os itens do carrinho. Preço/nome vêm sempre do
 * catálogo no momento da criação (nunca confia no que o client mandou) --
 * evita alguém adulterar preço via devtools.
 */
export async function createSale(
  items: CreateSaleItemInput[],
  notes: string | null,
  db: Db = createServiceClient(),
): Promise<PdvSaleWithDetails> {
  if (items.length === 0) {
    throw new PdvError('Carrinho vazio.', 'validation')
  }

  const resolvedItems: Array<{
    item_type: PdvItemType
    product_id: string | null
    service_id: string | null
    label: string
    quantity: number
    unit_price: number
  }> = []

  for (const item of items) {
    if (!(item.quantity > 0)) throw new PdvError('Quantidade inválida.', 'validation')

    if (item.item_type === 'product') {
      if (!item.product_id) throw new PdvError('Produto não informado.', 'validation')
      const { data, error } = await db
        .from('products')
        .select('id, name, price, quantity, active')
        .eq('id', item.product_id)
        .maybeSingle()
      if (error || !data) throw new PdvError('Produto não encontrado.', 'not_found')
      if (!data.active) throw new PdvError(`Produto "${data.name}" está inativo.`, 'validation')
      if (Number(data.quantity) < item.quantity) {
        throw new PdvError(`Estoque insuficiente pra "${data.name}" (disponível: ${data.quantity}).`, 'insufficient_stock')
      }
      resolvedItems.push({
        item_type: 'product',
        product_id: data.id,
        service_id: null,
        label: data.name,
        quantity: item.quantity,
        unit_price: Number(data.price),
      })
    } else {
      if (!item.service_id) throw new PdvError('Serviço não informado.', 'validation')
      const { data, error } = await db
        .from('service_catalog_items')
        .select('id, model_name, repair_type, price, active')
        .eq('id', item.service_id)
        .maybeSingle()
      if (error || !data) throw new PdvError('Serviço não encontrado.', 'not_found')
      if (!data.active) throw new PdvError(`Serviço "${data.model_name}" está inativo.`, 'validation')
      resolvedItems.push({
        item_type: 'service',
        product_id: null,
        service_id: data.id,
        label: `${data.model_name} — ${data.repair_type}`,
        quantity: item.quantity,
        unit_price: Number(data.price),
      })
    }
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  const { data: sale, error: saleErr } = await db
    .from('pdv_sales')
    .insert({ status: 'aberta', total_value: total, notes })
    .select()
    .single()
  if (saleErr) throw new PdvError(`Falha ao abrir venda: ${saleErr.message}`, 'validation')

  const { data: insertedItems, error: itemsErr } = await db
    .from('pdv_sale_items')
    .insert(resolvedItems.map((i) => ({ ...i, sale_id: sale.id })))
    .select()
  if (itemsErr) throw new PdvError(`Falha ao registrar itens: ${itemsErr.message}`, 'validation')

  return { ...(sale as PdvSale), items: insertedItems as PdvSaleItem[], payments: [] }
}

export async function getSale(id: string, db: Db = createServiceClient()): Promise<PdvSaleWithDetails> {
  const [{ data: sale, error }, { data: items }, { data: payments }] = await Promise.all([
    db.from('pdv_sales').select('*').eq('id', id).maybeSingle(),
    db.from('pdv_sale_items').select('*').eq('sale_id', id),
    db.from('pdv_payments').select('*').eq('sale_id', id).order('created_at'),
  ])
  if (error || !sale) throw new PdvError('Venda não encontrada.', 'not_found')
  return { ...(sale as PdvSale), items: (items ?? []) as PdvSaleItem[], payments: (payments ?? []) as PdvPayment[] }
}

export type AddPaymentInput = {
  method: PdvPaymentMethod
  amount: number
  installments?: number | null
  change_amount?: number | null
  /** Preenchido só pra Pix -- confirmado via status real na Mercado Pago, não clique do lojista. */
  mp_payment_id?: string | null
}

/** Adiciona uma forma de pagamento à venda (pendente até confirmar). */
export async function addPayment(
  saleId: string,
  input: AddPaymentInput,
  db: Db = createServiceClient(),
): Promise<PdvPayment> {
  const sale = await getSale(saleId, db)
  if (sale.status !== 'aberta') {
    throw new PdvError('Essa venda já foi concluída ou cancelada.', 'conflict')
  }
  if (!(input.amount > 0)) throw new PdvError('Valor do pagamento precisa ser maior que zero.', 'validation')

  const alreadyAdded = sale.payments
    .filter((p) => p.status !== 'cancelado')
    .reduce((sum, p) => sum + p.amount, 0)
  if (alreadyAdded + input.amount > sale.total_value + 0.01) {
    throw new PdvError('Soma dos pagamentos passaria do total da venda.', 'validation')
  }

  const { data, error } = await db
    .from('pdv_payments')
    .insert({
      sale_id: saleId,
      method: input.method,
      amount: input.amount,
      installments: input.installments ?? null,
      change_amount: input.change_amount ?? null,
      mp_payment_id: input.mp_payment_id ?? null,
      status: 'pendente',
    })
    .select()
    .single()
  if (error) throw new PdvError(`Falha ao adicionar pagamento: ${error.message}`, 'validation')
  return data as PdvPayment
}

/**
 * Confirma um pagamento manual (cartão/dinheiro — o lojista clicou "confirmar
 * recebimento"). Quando a soma dos confirmados cobre o total, a venda é
 * concluída: baixa de estoque nos itens de produto e criação de
 * service_requests (fila do lojista) nos itens de serviço.
 */
export async function confirmPayment(
  saleId: string,
  paymentId: string,
  db: Db = createServiceClient(),
): Promise<PdvSaleWithDetails> {
  const sale = await getSale(saleId, db)
  const payment = sale.payments.find((p) => p.id === paymentId)
  if (!payment) throw new PdvError('Pagamento não encontrado.', 'not_found')
  if (payment.status === 'confirmado') return sale

  const { error: confirmErr } = await db
    .from('pdv_payments')
    .update({ status: 'confirmado', confirmed_at: new Date().toISOString() })
    .eq('id', paymentId)
  if (confirmErr) throw new PdvError(`Falha ao confirmar pagamento: ${confirmErr.message}`, 'validation')

  const confirmedTotal = sale.payments
    .filter((p) => p.id !== paymentId && p.status === 'confirmado')
    .reduce((sum, p) => sum + p.amount, 0) + payment.amount

  if (confirmedTotal + 0.01 >= sale.total_value) {
    await concludeSale(saleId, db)
  }

  return getSale(saleId, db)
}

/**
 * Fecha a venda: dá baixa de estoque (produtos) e cria/atualiza
 * service_requests dos itens de serviço, com o mesmo padrão de rastreio de
 * origem usado no resto do sistema (agendamento por WhatsApp, vitrine etc).
 * Nunca decrementa/gera duas vezes o mesmo item (stock_deducted /
 * service_request_id já preenchido são pulados).
 */
async function concludeSale(saleId: string, db: Db): Promise<void> {
  const sale = await getSale(saleId, db)
  if (sale.status === 'concluida') return

  for (const item of sale.items) {
    if (item.item_type === 'product' && item.product_id && !item.stock_deducted) {
      const { data: product } = await db
        .from('products')
        .select('quantity')
        .eq('id', item.product_id)
        .maybeSingle()
      if (product) {
        const newQty = Math.max(0, Number(product.quantity) - item.quantity)
        await db.from('products').update({ quantity: newQty }).eq('id', item.product_id)
      }
      await db.from('pdv_sale_items').update({ stock_deducted: true }).eq('id', item.id)
    }

    if (item.item_type === 'service' && !item.service_request_id) {
      const { data: req, error } = await db
        .from('service_requests')
        .insert({
          customer_name: 'Cliente balcão',
          customer_phone: '00000000000',
          problem_description: `Venda PDV: ${item.label}`,
          selected_service_ids: item.service_id ? [item.service_id] : [],
          diagnosis_requested: false,
          self_pickup: true,
          payment_methods: [],
          status: 'finished',
          source: 'pdv',
          quote_value: item.unit_price * item.quantity,
        })
        .select('id')
        .single()
      if (!error && req) {
        await db.from('pdv_sale_items').update({ service_request_id: req.id }).eq('id', item.id)
      }
    }
  }

  await db
    .from('pdv_sales')
    .update({ status: 'concluida', concluded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', saleId)
}

export async function cancelSale(saleId: string, db: Db = createServiceClient()): Promise<void> {
  const sale = await getSale(saleId, db)
  if (sale.status === 'concluida') {
    throw new PdvError('Não é possível cancelar uma venda já concluída.', 'conflict')
  }
  await db.from('pdv_sales').update({ status: 'cancelada', updated_at: new Date().toISOString() }).eq('id', saleId)
}

export async function listOpenSales(db: Db = createServiceClient()): Promise<PdvSale[]> {
  const { data, error } = await db
    .from('pdv_sales')
    .select('*')
    .eq('status', 'aberta')
    .order('created_at', { ascending: false })
  if (error) throw new PdvError(`Falha ao listar vendas: ${error.message}`, 'validation')
  return (data ?? []) as PdvSale[]
}
