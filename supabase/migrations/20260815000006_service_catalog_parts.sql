-- Peças (itens de estoque) como dependência de um serviço do catálogo, e o
-- custo do serviço calculado a partir delas — separado do preço final
-- cobrado do cliente (service_catalog_items.price, já existente).
ALTER TABLE vrtech.service_catalog_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS vrtech.service_catalog_item_parts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_catalog_item_id UUID NOT NULL REFERENCES vrtech.service_catalog_items(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES vrtech.stock_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vrt_scip_service ON vrtech.service_catalog_item_parts(service_catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_vrt_scip_stock ON vrtech.service_catalog_item_parts(stock_item_id);

ALTER TABLE vrtech.service_catalog_item_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_parts_select" ON vrtech.service_catalog_item_parts;
CREATE POLICY "catalog_parts_select" ON vrtech.service_catalog_item_parts FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_parts_all" ON vrtech.service_catalog_item_parts;
CREATE POLICY "catalog_parts_all" ON vrtech.service_catalog_item_parts FOR ALL USING (auth.role() = 'authenticated');
GRANT ALL ON vrtech.service_catalog_item_parts TO anon, authenticated, service_role;
