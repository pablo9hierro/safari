-- =====================================================
-- VR Tech v11 — Execute no SQL Editor do Supabase
-- Controle de estoque (interno — cliente não visualiza nada disso)
-- =====================================================

-- Catálogo de itens de estoque. A quantidade é sempre derivada das
-- movimentações (nunca editada diretamente) via trigger abaixo.
CREATE TABLE IF NOT EXISTS stock_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL DEFAULT 'unidade' CHECK (unit IN ('unidade', 'caixa')),
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_items_name ON stock_items (lower(name));

-- Movimentações (entrada/saída) — histórico de tudo que altera o estoque
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('unidade', 'caixa')),
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_moved_at ON stock_movements (moved_at DESC);

-- Mantém stock_items.quantity sempre consistente com o histórico de movimentações
CREATE OR REPLACE FUNCTION apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.type = 'entrada' THEN
    UPDATE stock_items SET quantity = quantity + NEW.quantity, updated_at = NOW() WHERE id = NEW.item_id;
  ELSE
    UPDATE stock_items SET quantity = quantity - NEW.quantity, updated_at = NOW() WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON stock_movements;
CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- =====================================================
-- RLS — somente o admin autenticado no dashboard acessa estoque
-- =====================================================

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_stock_items" ON stock_items;
CREATE POLICY "auth_all_stock_items" ON stock_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_stock_movements" ON stock_movements;
CREATE POLICY "auth_all_stock_movements" ON stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
