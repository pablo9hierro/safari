/**
 * Testa a conexão com o novo Supabase e verifica se as tabelas existem.
 * Uso: node scripts/test-connection.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zncpcsdpdkvjfknmmhpu.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada.')
  console.error('   Rode: SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-connection.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const TABLES = [
  'service_requests',
  'service_orders',
  'service_order_updates',
  'whatsapp_state',
  'stock_items',
  'stock_movements',
  'neighborhood_shipping_rates',
  'product_categories',
  'products',
  'store_orders',
  'store_order_items',
]

async function run() {
  console.log('🔌 Testando conexão com Supabase...\n')

  let allOk = true

  for (const table of TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      console.log(`  ❌ ${table.padEnd(30)} ${error.message}`)
      allOk = false
    } else {
      console.log(`  ✅ ${table}`)
    }
  }

  console.log('\n─────────────────────────────────────')

  if (allOk) {
    console.log('✅ Todas as tabelas acessíveis. Banco pronto.\n')
  } else {
    console.log('⚠️  Algumas tabelas não existem ainda.')
    console.log('   Execute supabase/vrtech_full_schema.sql no SQL Editor do Supabase.\n')
    process.exit(1)
  }
}

run().catch((e) => { console.error('Erro fatal:', e); process.exit(1) })
