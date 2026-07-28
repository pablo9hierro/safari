-- VR Tech — Migration v2
-- Geolocalização, shipping_settings (frete por km), catálogo de serviços

-- ─── Geolocalização em service_requests ────────────────────────────────────

ALTER TABLE vrtech.service_requests
  ADD COLUMN IF NOT EXISTS address_lat   double precision,
  ADD COLUMN IF NOT EXISTS address_lng   double precision,
  ADD COLUMN IF NOT EXISTS address_label text;

-- ─── Frete por km (substitui bairro fixo) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.shipping_settings (
  id int PRIMARY KEY DEFAULT 1,
  price_per_km double precision NOT NULL DEFAULT 2.0,
  store_lat    double precision NOT NULL DEFAULT -7.1195,
  store_lng    double precision NOT NULL DEFAULT -34.8450,
  max_km       double precision,
  CHECK (id = 1)
);

INSERT INTO vrtech.shipping_settings (id, price_per_km, store_lat, store_lng, max_km)
VALUES (1, 2.0, -7.1195, -34.8450, NULL)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON vrtech.shipping_settings TO anon, authenticated, service_role;

ALTER TABLE vrtech.shipping_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_shipping_settings" ON vrtech.shipping_settings;
CREATE POLICY "anon_select_shipping_settings" ON vrtech.shipping_settings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_shipping_settings"   ON vrtech.shipping_settings;
CREATE POLICY "auth_all_shipping_settings"   ON vrtech.shipping_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION vrtech.estimate_shipping(p_lat double precision, p_lng double precision)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_s vrtech.shipping_settings%ROWTYPE;
  v_km double precision;
BEGIN
  SELECT * INTO v_s FROM vrtech.shipping_settings WHERE id = 1;
  v_km := 2 * 6371 * asin(sqrt(
    sin(radians(p_lat - v_s.store_lat) / 2) ^ 2 +
    cos(radians(v_s.store_lat)) * cos(radians(p_lat)) *
    sin(radians(p_lng - v_s.store_lng) / 2) ^ 2
  ));
  RETURN jsonb_build_object(
    'km',           round(v_km::numeric, 2),
    'price',        round((v_km * v_s.price_per_km)::numeric, 2),
    'max_km',       v_s.max_km,
    'within_range', (v_s.max_km IS NULL OR v_km <= v_s.max_km)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION vrtech.estimate_shipping TO anon, authenticated, service_role;

-- ─── Catálogo de serviços ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.service_catalog_categories (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

GRANT ALL ON vrtech.service_catalog_categories TO anon, authenticated, service_role;
ALTER TABLE vrtech.service_catalog_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_cat_select" ON vrtech.service_catalog_categories;
CREATE POLICY "catalog_cat_select" ON vrtech.service_catalog_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_cat_all"    ON vrtech.service_catalog_categories;
CREATE POLICY "catalog_cat_all"    ON vrtech.service_catalog_categories FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS vrtech.service_catalog_items (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES vrtech.service_catalog_categories(id) ON DELETE CASCADE,
  model_name  text NOT NULL,
  repair_type text NOT NULL,
  price       numeric NOT NULL DEFAULT 0,
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_sci_category ON vrtech.service_catalog_items(category_id);
CREATE INDEX IF NOT EXISTS idx_vrt_sci_active   ON vrtech.service_catalog_items(active);

GRANT ALL ON vrtech.service_catalog_items TO anon, authenticated, service_role;
ALTER TABLE vrtech.service_catalog_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_items_select" ON vrtech.service_catalog_items;
CREATE POLICY "catalog_items_select" ON vrtech.service_catalog_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_items_all"    ON vrtech.service_catalog_items;
CREATE POLICY "catalog_items_all"    ON vrtech.service_catalog_items FOR ALL USING (auth.role() = 'authenticated');

-- ─── Categorias iniciais ─────────────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_categories (name, slug, sort_order) VALUES
  ('iPhone',   'iphone',   1),
  ('Samsung',  'samsung',  2),
  ('Motorola', 'motorola', 3),
  ('Xiaomi',   'xiaomi',   4)
ON CONFLICT (slug) DO NOTHING;
