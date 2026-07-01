-- =====================================================
-- VR Tech — Zerar banco para produção
-- Execute no SQL Editor do Supabase
-- ATENÇÃO: apaga TODOS os dados de teste. Irreversível.
-- =====================================================

-- Desativa constraints temporariamente para truncar com FKs
SET session_replication_role = replica;

TRUNCATE TABLE
  service_order_updates,
  service_orders,
  service_requests,
  stock_movements,
  stock_items,
  store_order_items,
  store_orders,
  product_categories,
  products
RESTART IDENTITY CASCADE;

-- Reativa constraints
SET session_replication_role = DEFAULT;

-- =====================================================
-- neighborhood_shipping_rates NÃO foi apagado —
-- você provavelmente quer manter as tarifas cadastradas.
-- Se quiser zerar as tarifas também, descomente abaixo:
-- TRUNCATE TABLE neighborhood_shipping_rates RESTART IDENTITY;
-- =====================================================

-- =====================================================
-- Para limpar os arquivos do Storage (imagens, PDFs):
-- Vá em Storage no painel do Supabase e esvazie os buckets:
--   • service-images
--   • service-order-media
-- Não há SQL para isso — use a interface do Supabase.
-- =====================================================
