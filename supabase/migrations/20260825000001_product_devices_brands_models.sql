-- Produto ganha o mesmo modelo de compatibilidade many-to-many que serviço
-- já tinha (ver 20260821000006_catalogo_many_to_many.sql): um produto pode
-- se aplicar a múltiplos aparelhos/marcas/modelos ao mesmo tempo, e cada
-- dimensão vazia = universal PRA AQUELA DIMENSÃO (ex.: aparelho vazio +
-- marca=Samsung + modelo vazio = "serve pra qualquer aparelho Samsung, de
-- qualquer modelo"). Reaproveita as MESMAS tabelas mestre de aparelho/marca
-- (device_types/service_catalog_categories) e modelo (catalog_models) que
-- serviço já usa -- um cadastro só de aparelho/marca/modelo pra loja
-- inteira, em vez de duplicar listas por tipo de item.
--
-- products.phone_brand/phone_model continuam existindo como colunas de
-- COMPATIBILIDADE (mesma estratégia da migration de serviço): sincronizadas
-- pela aplicação a partir da 1ª marca/1º modelo selecionado, pra quem ainda
-- lê direto essas colunas (PDV, filtro por marca) não quebrar de uma vez.

CREATE TABLE IF NOT EXISTS vrtech.product_devices (
  product_id     uuid NOT NULL REFERENCES vrtech.products(id) ON DELETE CASCADE,
  device_type_id uuid NOT NULL REFERENCES vrtech.device_types(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, device_type_id)
);

CREATE TABLE IF NOT EXISTS vrtech.product_brands (
  product_id uuid NOT NULL REFERENCES vrtech.products(id) ON DELETE CASCADE,
  brand_id   uuid NOT NULL REFERENCES vrtech.service_catalog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, brand_id)
);

CREATE TABLE IF NOT EXISTS vrtech.product_models (
  product_id uuid NOT NULL REFERENCES vrtech.products(id) ON DELETE CASCADE,
  model_id   uuid NOT NULL REFERENCES vrtech.catalog_models(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, model_id)
);

GRANT ALL ON vrtech.product_devices TO anon, authenticated, service_role;
GRANT ALL ON vrtech.product_brands TO anon, authenticated, service_role;
GRANT ALL ON vrtech.product_models TO anon, authenticated, service_role;
ALTER TABLE vrtech.product_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.product_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pd_select" ON vrtech.product_devices;
CREATE POLICY "pd_select" ON vrtech.product_devices FOR SELECT USING (true);
DROP POLICY IF EXISTS "pd_auth_all" ON vrtech.product_devices;
CREATE POLICY "pd_auth_all" ON vrtech.product_devices FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "pb_select" ON vrtech.product_brands;
CREATE POLICY "pb_select" ON vrtech.product_brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "pb_auth_all" ON vrtech.product_brands;
CREATE POLICY "pb_auth_all" ON vrtech.product_brands FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "pm_select" ON vrtech.product_models;
CREATE POLICY "pm_select" ON vrtech.product_models FOR SELECT USING (true);
DROP POLICY IF EXISTS "pm_auth_all" ON vrtech.product_models;
CREATE POLICY "pm_auth_all" ON vrtech.product_models FOR ALL USING (auth.role() = 'authenticated');

-- Backfill best-effort: casa o texto livre já cadastrado (phone_brand/
-- phone_model) com o cadastro mestre por nome exato (case-insensitive).
-- Produto sem correspondência fica sem vínculo (universal) -- nunca trava
-- a migration nem inventa vínculo errado.
INSERT INTO vrtech.product_brands (product_id, brand_id)
SELECT p.id, c.id
FROM vrtech.products p
JOIN vrtech.service_catalog_categories c ON lower(c.name) = lower(p.phone_brand)
WHERE p.phone_brand IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.product_models (product_id, model_id)
SELECT p.id, m.id
FROM vrtech.products p
JOIN vrtech.product_brands pb ON pb.product_id = p.id
JOIN vrtech.catalog_models m ON m.brand_id = pb.brand_id AND lower(m.name) = lower(p.phone_model)
WHERE p.phone_model IS NOT NULL
ON CONFLICT DO NOTHING;
