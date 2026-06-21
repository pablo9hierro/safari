-- =====================================================
-- VR Tech v13 — Execute no SQL Editor do Supabase
-- Status de venda/recusa por item do pedido (não mais por pedido inteiro)
-- =====================================================

ALTER TABLE store_order_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'vendido', 'recusado'));

-- Backfill: itens de pedidos que já tinham sido decididos no nível do pedido
-- (antes desta migration) herdam o status do pedido.
UPDATE store_order_items soi
SET status = so.status
FROM store_orders so
WHERE soi.store_order_id = so.id
  AND so.status IN ('vendido', 'recusado');
