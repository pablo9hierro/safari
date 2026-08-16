-- Custo avulso do serviço: um item de custo que NÃO é peça de estoque nem
-- produto — ex: taxa de terceiro, frete de peça encomendada, mão de obra
-- externa. Nome livre + valor, somado ao custo do serviço junto com as
-- peças de estoque (service_catalog_item_parts).
CREATE TABLE IF NOT EXISTS vrtech.service_catalog_item_extra_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_catalog_item_id UUID NOT NULL REFERENCES vrtech.service_catalog_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value NUMERIC NOT NULL CHECK (value >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vrt_scec_service ON vrtech.service_catalog_item_extra_costs(service_catalog_item_id);

ALTER TABLE vrtech.service_catalog_item_extra_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_extra_costs_select" ON vrtech.service_catalog_item_extra_costs;
CREATE POLICY "catalog_extra_costs_select" ON vrtech.service_catalog_item_extra_costs FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_extra_costs_all" ON vrtech.service_catalog_item_extra_costs;
CREATE POLICY "catalog_extra_costs_all" ON vrtech.service_catalog_item_extra_costs FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON vrtech.service_catalog_item_extra_costs TO anon, authenticated, service_role;
