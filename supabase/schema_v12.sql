-- =====================================================
-- VR Tech v12 — Execute no SQL Editor do Supabase
-- Frete por bairro + Catálogo de produtos + Carrinho/Pedidos da loja
-- =====================================================

-- ─── 1. Frete por bairro (João Pessoa) ──────────────────
CREATE TABLE IF NOT EXISTS neighborhood_shipping_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  neighborhood TEXT NOT NULL UNIQUE,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Pré-popula com todos os bairros oficiais (preço inicial R$ 0,00 — o admin edita em /dashboard/frete)
INSERT INTO neighborhood_shipping_rates (neighborhood, price) VALUES
  ('Aeroclube', 0), ('Alto do Céu', 0), ('Alto do Mateus', 0), ('Anatólia', 0),
  ('Água Fria', 0), ('Bairro das Indústrias', 0), ('Bairro dos Estados', 0),
  ('Bairro dos Ipês', 0), ('Bancários', 0), ('Barra de Gramame', 0), ('Bessa', 0),
  ('Brisamar', 0), ('Cabo Branco', 0), ('Castelo Branco', 0), ('Centro', 0),
  ('Cidade dos Colibris', 0), ('Costa do Sol', 0), ('Costa e Silva', 0),
  ('Cristo Redentor', 0), ('Cruz das Armas', 0), ('Cuiá', 0), ('Distrito Industrial', 0),
  ('Ernani Sátiro', 0), ('Ernesto Geisel', 0), ('Expedicionários', 0), ('Funcionários', 0),
  ('Geisel', 0), ('Gramame', 0), ('Grotão', 0), ('Ilha do Bispo', 0), ('Jaguaribe', 0),
  ('Jardim Cidade Universitária', 0), ('Jardim Oceania', 0), ('Jardim São Paulo', 0),
  ('Jardim Veneza', 0), ('José Pinheiro', 0), ('Manaíra', 0), ('Mandacaru', 0),
  ('Mangabeira', 0), ('Miramar', 0), ('Mumbaba', 0), ('Muçumagro', 0), ('Oitizeiro', 0),
  ('Padre Zé', 0), ('Paratibe', 0), ('Pedro Gondim', 0), ('Penha', 0),
  ('Planalto Boa Esperança', 0), ('Portal do Sol', 0), ('Praia do Bessa', 0), ('Range', 0),
  ('Roger', 0), ('São José', 0), ('Tambaú', 0), ('Tambauzinho', 0), ('Tambiá', 0),
  ('Torre', 0), ('Treze de Maio', 0), ('Trincheiras', 0), ('Valentina de Figueiredo', 0),
  ('Varadouro', 0), ('Varjão', 0)
ON CONFLICT (neighborhood) DO NOTHING;

-- ─── 2. Categorias de produto (criadas dinamicamente pelo admin) ───
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── 3. Catálogo de produtos ─────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ─── 4. Pedidos feitos pelo cliente via catálogo (carrinho) ───
CREATE TABLE IF NOT EXISTS store_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  neighborhood TEXT,
  shipping_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pickup_at_store BOOLEAN NOT NULL DEFAULT false,
  total_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'vendido', 'recusado')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS store_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_order_id UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON store_order_items(store_order_id);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE neighborhood_shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;

-- Frete: leitura pública (checkout do cliente precisa ler o valor), admin edita
DROP POLICY IF EXISTS "anon_select_shipping_rates" ON neighborhood_shipping_rates;
CREATE POLICY "anon_select_shipping_rates" ON neighborhood_shipping_rates
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_shipping_rates" ON neighborhood_shipping_rates;
CREATE POLICY "auth_all_shipping_rates" ON neighborhood_shipping_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Categorias: leitura pública (catálogo mostra a categoria), admin cria/edita
DROP POLICY IF EXISTS "anon_select_product_categories" ON product_categories;
CREATE POLICY "anon_select_product_categories" ON product_categories
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_all_product_categories" ON product_categories;
CREATE POLICY "auth_all_product_categories" ON product_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Produtos: cliente só vê produtos ativos; admin gerencia tudo
DROP POLICY IF EXISTS "anon_select_active_products" ON products;
CREATE POLICY "anon_select_active_products" ON products
  FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS "auth_all_products" ON products;
CREATE POLICY "auth_all_products" ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Pedidos: cliente cria (anon insert), só admin lê/gerencia
DROP POLICY IF EXISTS "anon_insert_store_orders" ON store_orders;
CREATE POLICY "anon_insert_store_orders" ON store_orders
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_store_orders" ON store_orders;
CREATE POLICY "auth_all_store_orders" ON store_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_store_order_items" ON store_order_items;
CREATE POLICY "anon_insert_store_order_items" ON store_order_items
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_store_order_items" ON store_order_items;
CREATE POLICY "auth_all_store_order_items" ON store_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
