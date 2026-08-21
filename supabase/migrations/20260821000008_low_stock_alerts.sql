-- Alerta de reposição/em-falta: threshold configurável por item (produto ou
-- item de estoque) + log de eventos pra alimentar o feed de atividade em
-- /dashboard/relatorios (criado/editado/removido/estoque atualizado/entrou
-- em baixo estoque/entrou em falta).

ALTER TABLE vrtech.products ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC;
ALTER TABLE vrtech.stock_items ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC;

CREATE TABLE IF NOT EXISTS vrtech.stock_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'stock_item')),
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'updated', 'deleted', 'stock_updated', 'low_stock', 'out_of_stock'
  )),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_activity_log_created ON vrtech.stock_activity_log(created_at DESC);

GRANT ALL ON vrtech.stock_activity_log TO anon, authenticated, service_role;
ALTER TABLE vrtech.stock_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_activity_log_all" ON vrtech.stock_activity_log;
CREATE POLICY "stock_activity_log_all" ON vrtech.stock_activity_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
