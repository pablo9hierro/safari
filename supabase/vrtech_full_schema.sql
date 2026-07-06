-- =====================================================
-- VR Tech — Schema COMPLETO (v1 → v19 consolidado)
-- Execute no SQL Editor do novo Supabase
--
-- Multi-tenant: VR Tech usa o schema 'vrtech' isolado.
-- Outros apps usam schemas separados (ex: delivery.*).
--
-- IMPORTANTE: após rodar este SQL, vá em:
--   Supabase Dashboard → Settings → API → "Extra Search Path"
--   e adicione: vrtech
-- =====================================================

CREATE SCHEMA IF NOT EXISTS vrtech;

-- ─────────────────────────────────────────────────────
-- 1. TABELAS
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.service_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  phone_model TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  image_url TEXT,
  address_cep TEXT,
  address_street TEXT,
  address_number TEXT,
  address_reference TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','accepted','rejected','retirada_local','em_busca',
      'in_progress','em_entrega','completed','em_pagamento',
      'delivered','finished','cancelled'
    )),
  quote_value NUMERIC,
  owner_notes TEXT,
  discount_percent INTEGER
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  self_pickup BOOLEAN NOT NULL DEFAULT false,
  shipping_price NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_vrt_sr_status     ON vrtech.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_vrt_sr_created_at ON vrtech.service_requests(created_at DESC);

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.whatsapp_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','connecting','disconnected')),
  qr_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.service_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE
    REFERENCES vrtech.service_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_services TEXT,
  warranty TEXT,
  final_value NUMERIC,
  pdf_url TEXT,
  closed_at TIMESTAMPTZ,
  used_parts JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_vrt_so_request_id ON vrtech.service_orders(request_id);

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.service_order_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL
    REFERENCES vrtech.service_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  message TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL DEFAULT 'update'
    CHECK (action_type IN ('created','checklist_update','update','completed','reopened')),
  component TEXT
);

CREATE INDEX IF NOT EXISTS idx_vrt_sou_order_id   ON vrtech.service_order_updates(service_order_id);
CREATE INDEX IF NOT EXISTS idx_vrt_sou_created_at ON vrtech.service_order_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_vrt_sou_component  ON vrtech.service_order_updates(service_order_id, component);

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.stock_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL DEFAULT 'unidade' CHECK (unit IN ('unidade','caixa')),
  quantity NUMERIC NOT NULL DEFAULT 0,
  price NUMERIC,
  warranty_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_si_name ON vrtech.stock_items(lower(name));

CREATE TABLE IF NOT EXISTS vrtech.stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES vrtech.stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada','saida')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('unidade','caixa')),
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_sm_item_id  ON vrtech.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_vrt_sm_moved_at ON vrtech.stock_movements(moved_at DESC);

CREATE OR REPLACE FUNCTION vrtech.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.type = 'entrada' THEN
    UPDATE vrtech.stock_items
    SET quantity = quantity + NEW.quantity, updated_at = NOW()
    WHERE id = NEW.item_id;
  ELSE
    UPDATE vrtech.stock_items
    SET quantity = quantity - NEW.quantity, updated_at = NOW()
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON vrtech.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON vrtech.stock_movements
  FOR EACH ROW EXECUTE FUNCTION vrtech.apply_stock_movement();

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.neighborhood_shipping_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  neighborhood TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO vrtech.neighborhood_shipping_rates (neighborhood, price) VALUES
  ('Aeroclube',0),('Alto do Céu',0),('Alto do Mateus',0),('Anatólia',0),
  ('Água Fria',0),('Bairro das Indústrias',0),('Bairro dos Estados',0),
  ('Bairro dos Ipês',0),('Bancários',0),('Barra de Gramame',0),('Bessa',0),
  ('Brisamar',0),('Cabo Branco',0),('Castelo Branco',0),('Centro',0),
  ('Cidade dos Colibris',0),('Costa do Sol',0),('Costa e Silva',0),
  ('Cristo Redentor',0),('Cruz das Armas',0),('Cuiá',0),('Distrito Industrial',0),
  ('Ernani Sátiro',0),('Ernesto Geisel',0),('Expedicionários',0),('Funcionários',0),
  ('Geisel',0),('Gramame',0),('Grotão',0),('Ilha do Bispo',0),('Jaguaribe',0),
  ('Jardim Cidade Universitária',0),('Jardim Oceania',0),('Jardim São Paulo',0),
  ('Jardim Veneza',0),('José Pinheiro',0),('Manaíra',0),('Mandacaru',0),
  ('Mangabeira',0),('Miramar',0),('Mumbaba',0),('Muçumagro',0),('Oitizeiro',0),
  ('Padre Zé',0),('Paratibe',0),('Pedro Gondim',0),('Penha',0),
  ('Planalto Boa Esperança',0),('Portal do Sol',0),('Praia do Bessa',0),('Range',0),
  ('Roger',0),('São José',0),('Tambaú',0),('Tambauzinho',0),('Tambiá',0),
  ('Torre',0),('Treze de Maio',0),('Trincheiras',0),('Valentina de Figueiredo',0),
  ('Varadouro',0),('Varjão',0),('José Américo de Almeida',0)
ON CONFLICT (neighborhood) DO NOTHING;

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vrtech.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  category_id UUID REFERENCES vrtech.product_categories(id) ON DELETE SET NULL,
  image_url TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}'
    CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 3),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_products_category ON vrtech.products(category_id);

-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.store_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  neighborhood TEXT,
  shipping_price NUMERIC NOT NULL DEFAULT 0,
  pickup_at_store BOOLEAN NOT NULL DEFAULT false,
  total_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','vendido','recusado')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vrtech.store_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_order_id UUID NOT NULL
    REFERENCES vrtech.store_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES vrtech.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','vendido','recusado')),
  discount_percent INTEGER
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_vrt_soi_order ON vrtech.store_order_items(store_order_id);

-- ─────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────

ALTER TABLE vrtech.service_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.whatsapp_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.service_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.service_order_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.stock_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.stock_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.neighborhood_shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.product_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.store_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.store_order_items       ENABLE ROW LEVEL SECURITY;

-- service_requests
DROP POLICY IF EXISTS "anon_insert_service_requests" ON vrtech.service_requests;
CREATE POLICY "anon_insert_service_requests" ON vrtech.service_requests
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_service_requests" ON vrtech.service_requests;
CREATE POLICY "anon_select_service_requests" ON vrtech.service_requests
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_select_service_requests" ON vrtech.service_requests;
CREATE POLICY "auth_select_service_requests" ON vrtech.service_requests
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_service_requests" ON vrtech.service_requests;
CREATE POLICY "auth_update_service_requests" ON vrtech.service_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- whatsapp_state
DROP POLICY IF EXISTS "auth_all_whatsapp_state" ON vrtech.whatsapp_state;
CREATE POLICY "auth_all_whatsapp_state" ON vrtech.whatsapp_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service_orders
DROP POLICY IF EXISTS "anon_select_service_orders" ON vrtech.service_orders;
CREATE POLICY "anon_select_service_orders" ON vrtech.service_orders
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_service_orders" ON vrtech.service_orders;
CREATE POLICY "auth_all_service_orders" ON vrtech.service_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service_order_updates
DROP POLICY IF EXISTS "anon_select_service_order_updates" ON vrtech.service_order_updates;
CREATE POLICY "anon_select_service_order_updates" ON vrtech.service_order_updates
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_service_order_updates" ON vrtech.service_order_updates;
CREATE POLICY "auth_all_service_order_updates" ON vrtech.service_order_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- stock
DROP POLICY IF EXISTS "auth_all_stock_items" ON vrtech.stock_items;
CREATE POLICY "auth_all_stock_items" ON vrtech.stock_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_stock_movements" ON vrtech.stock_movements;
CREATE POLICY "auth_all_stock_movements" ON vrtech.stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- frete / categorias / produtos
DROP POLICY IF EXISTS "anon_select_shipping_rates" ON vrtech.neighborhood_shipping_rates;
CREATE POLICY "anon_select_shipping_rates" ON vrtech.neighborhood_shipping_rates
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_shipping_rates" ON vrtech.neighborhood_shipping_rates;
CREATE POLICY "auth_all_shipping_rates" ON vrtech.neighborhood_shipping_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_product_categories" ON vrtech.product_categories;
CREATE POLICY "anon_select_product_categories" ON vrtech.product_categories
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_product_categories" ON vrtech.product_categories;
CREATE POLICY "auth_all_product_categories" ON vrtech.product_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_active_products" ON vrtech.products;
CREATE POLICY "anon_select_active_products" ON vrtech.products
  FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS "auth_all_products" ON vrtech.products;
CREATE POLICY "auth_all_products" ON vrtech.products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- loja
DROP POLICY IF EXISTS "anon_insert_store_orders" ON vrtech.store_orders;
CREATE POLICY "anon_insert_store_orders" ON vrtech.store_orders
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_store_orders" ON vrtech.store_orders;
CREATE POLICY "auth_all_store_orders" ON vrtech.store_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_store_order_items" ON vrtech.store_order_items;
CREATE POLICY "anon_insert_store_order_items" ON vrtech.store_order_items
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_store_order_items" ON vrtech.store_order_items;
CREATE POLICY "auth_all_store_order_items" ON vrtech.store_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────
-- 3. STORAGE BUCKETS (independentes de schema)
-- ─────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('vrtech-service-images', 'vrtech-service-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vrtech-service-order-media', 'vrtech-service-order-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "vrtech_anon_upload_images" ON storage.objects;
CREATE POLICY "vrtech_anon_upload_images" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'vrtech-service-images');

DROP POLICY IF EXISTS "vrtech_public_read_images" ON storage.objects;
CREATE POLICY "vrtech_public_read_images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'vrtech-service-images');

DROP POLICY IF EXISTS "vrtech_auth_upload_media" ON storage.objects;
CREATE POLICY "vrtech_auth_upload_media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vrtech-service-order-media');

DROP POLICY IF EXISTS "vrtech_auth_update_media" ON storage.objects;
CREATE POLICY "vrtech_auth_update_media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'vrtech-service-order-media');

DROP POLICY IF EXISTS "vrtech_public_read_media" ON storage.objects;
CREATE POLICY "vrtech_public_read_media" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'vrtech-service-order-media');

-- ─────────────────────────────────────────────────────
-- 4. FUNÇÕES RPC
-- ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS vrtech.search_requests_by_phone(text);
CREATE FUNCTION vrtech.search_requests_by_phone(phone_digits text)
RETURNS SETOF vrtech.service_requests
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM vrtech.service_requests
  WHERE regexp_replace(customer_phone, '\D', '', 'g')
        LIKE '%' || phone_digits || '%'
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION vrtech.search_requests_by_phone TO anon, authenticated;

-- ─────────────────────────────────────────────────────
-- 5. ROW INICIAL DO whatsapp_state
-- ─────────────────────────────────────────────────────

INSERT INTO vrtech.whatsapp_state (id, status) VALUES (1, 'disconnected')
ON CONFLICT (id) DO NOTHING;
