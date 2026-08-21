-- Reformulação do catálogo de serviços: aparelho e modelo viram entidades
-- cadastráveis (não mais enum fixo / string livre), e um serviço passa a
-- poder se aplicar a múltiplos aparelhos/marcas/modelos ao mesmo tempo.
--
-- service_catalog_items.category_id e .model_name NÃO são removidos --
-- ficam como colunas de COMPATIBILIDADE, sincronizadas automaticamente
-- pela aplicação a partir da primeira marca/modelo selecionado. Isso evita
-- quebrar de uma vez os consumidores que ainda leem direto dessas colunas
-- (PDV, assistente de IA, tags por IA, painel de outra loja) -- eles
-- migram depois, um de cada vez, sem incidente.

-- ─── Aparelho (promove o enum fixo pra tabela cadastrável) ──────────────────
CREATE TABLE IF NOT EXISTS vrtech.device_types (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  -- Chave de um ícone lucide fixo no front (Smartphone/Tablet/Laptop/Monitor/
  -- Wrench) -- 'generic' é o fallback pra aparelho novo cadastrado na hora,
  -- que não tem ícone específico mapeado no código ainda.
  icon_key    text NOT NULL DEFAULT 'generic',
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON vrtech.device_types TO anon, authenticated, service_role;
ALTER TABLE vrtech.device_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "device_types_select" ON vrtech.device_types;
CREATE POLICY "device_types_select" ON vrtech.device_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "device_types_auth_all" ON vrtech.device_types;
CREATE POLICY "device_types_auth_all" ON vrtech.device_types FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO vrtech.device_types (name, slug, icon_key, sort_order) VALUES
  ('Celular', 'celular', 'smartphone', 0),
  ('Tablet', 'tablet', 'tablet', 1),
  ('Notebook', 'notebook', 'laptop', 2),
  ('Computador', 'computador', 'monitor', 3),
  ('Outro', 'outro', 'generic', 4)
ON CONFLICT (slug) DO NOTHING;

-- service_catalog_categories.device_type (texto/CHECK) -> device_type_id (FK)
ALTER TABLE vrtech.service_catalog_categories
  ADD COLUMN IF NOT EXISTS device_type_id uuid REFERENCES vrtech.device_types(id);

UPDATE vrtech.service_catalog_categories c
SET device_type_id = dt.id
FROM vrtech.device_types dt
WHERE dt.slug = c.device_type AND c.device_type_id IS NULL;

-- ─── Modelo (promove model_name de string livre pra entidade cadastrável) ──
CREATE TABLE IF NOT EXISTS vrtech.catalog_models (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id    uuid NOT NULL REFERENCES vrtech.service_catalog_categories(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vrt_catalog_models_brand ON vrtech.catalog_models(brand_id);

GRANT ALL ON vrtech.catalog_models TO anon, authenticated, service_role;
ALTER TABLE vrtech.catalog_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_models_select" ON vrtech.catalog_models;
CREATE POLICY "catalog_models_select" ON vrtech.catalog_models FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_models_auth_all" ON vrtech.catalog_models;
CREATE POLICY "catalog_models_auth_all" ON vrtech.catalog_models FOR ALL USING (auth.role() = 'authenticated');

-- Popula catalog_models a partir dos model_name já cadastrados (distintos
-- por marca) -- itens universais (model_name NULL) não geram modelo.
INSERT INTO vrtech.catalog_models (brand_id, name, sort_order)
SELECT DISTINCT category_id, model_name, 0
FROM vrtech.service_catalog_items
WHERE model_name IS NOT NULL
ON CONFLICT (brand_id, name) DO NOTHING;

-- ─── Junções many-to-many ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vrtech.service_item_devices (
  service_catalog_item_id uuid NOT NULL REFERENCES vrtech.service_catalog_items(id) ON DELETE CASCADE,
  device_type_id          uuid NOT NULL REFERENCES vrtech.device_types(id) ON DELETE CASCADE,
  PRIMARY KEY (service_catalog_item_id, device_type_id)
);

CREATE TABLE IF NOT EXISTS vrtech.service_item_brands (
  service_catalog_item_id uuid NOT NULL REFERENCES vrtech.service_catalog_items(id) ON DELETE CASCADE,
  brand_id                uuid NOT NULL REFERENCES vrtech.service_catalog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (service_catalog_item_id, brand_id)
);

CREATE TABLE IF NOT EXISTS vrtech.service_item_models (
  service_catalog_item_id uuid NOT NULL REFERENCES vrtech.service_catalog_items(id) ON DELETE CASCADE,
  model_id                uuid NOT NULL REFERENCES vrtech.catalog_models(id) ON DELETE CASCADE,
  PRIMARY KEY (service_catalog_item_id, model_id)
);

GRANT ALL ON vrtech.service_item_devices TO anon, authenticated, service_role;
GRANT ALL ON vrtech.service_item_brands TO anon, authenticated, service_role;
GRANT ALL ON vrtech.service_item_models TO anon, authenticated, service_role;
ALTER TABLE vrtech.service_item_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.service_item_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.service_item_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sid_select" ON vrtech.service_item_devices;
CREATE POLICY "sid_select" ON vrtech.service_item_devices FOR SELECT USING (true);
DROP POLICY IF EXISTS "sid_auth_all" ON vrtech.service_item_devices;
CREATE POLICY "sid_auth_all" ON vrtech.service_item_devices FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "sib_select" ON vrtech.service_item_brands;
CREATE POLICY "sib_select" ON vrtech.service_item_brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "sib_auth_all" ON vrtech.service_item_brands;
CREATE POLICY "sib_auth_all" ON vrtech.service_item_brands FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "sim_select" ON vrtech.service_item_models;
CREATE POLICY "sim_select" ON vrtech.service_item_models FOR SELECT USING (true);
DROP POLICY IF EXISTS "sim_auth_all" ON vrtech.service_item_models;
CREATE POLICY "sim_auth_all" ON vrtech.service_item_models FOR ALL USING (auth.role() = 'authenticated');

-- Popula as 3 junções a partir do estado atual (1 marca + 1 aparelho da
-- marca + 0 ou 1 modelo por item, exatamente como já era antes).
INSERT INTO vrtech.service_item_brands (service_catalog_item_id, brand_id)
SELECT id, category_id FROM vrtech.service_catalog_items
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_item_devices (service_catalog_item_id, device_type_id)
SELECT i.id, c.device_type_id
FROM vrtech.service_catalog_items i
JOIN vrtech.service_catalog_categories c ON c.id = i.category_id
WHERE c.device_type_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_item_models (service_catalog_item_id, model_id)
SELECT i.id, m.id
FROM vrtech.service_catalog_items i
JOIN vrtech.catalog_models m ON m.brand_id = i.category_id AND m.name = i.model_name
WHERE i.model_name IS NOT NULL
ON CONFLICT DO NOTHING;
