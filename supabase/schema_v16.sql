-- =====================================================
-- VR Tech v16 — Execute no SQL Editor do Supabase
-- Garantia numérica (dias) por peça de estoque + desconto e
-- forma(s) de pagamento no aceite de venda da loja
-- =====================================================

-- ─── 1. Garantia em dias (substitui o texto livre criado na v15) ───
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS warranty_days INTEGER;
ALTER TABLE stock_items DROP COLUMN IF EXISTS warranty;

-- ─── 2. Desconto (%) e forma(s) de pagamento por item vendido na loja ───
ALTER TABLE store_order_items ADD COLUMN IF NOT EXISTS discount_percent INTEGER;
ALTER TABLE store_order_items DROP CONSTRAINT IF EXISTS store_order_items_discount_percent_range;
ALTER TABLE store_order_items ADD CONSTRAINT store_order_items_discount_percent_range
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

ALTER TABLE store_order_items ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;
