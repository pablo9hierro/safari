-- Seed: catálogo de serviços e produtos mock
-- Idempotente: ON CONFLICT DO NOTHING em tudo

-- ─── Categorias (marcas) ────────────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_categories (name, slug, sort_order) VALUES
  ('iPhone',   'iphone',   1),
  ('Samsung',  'samsung',  2),
  ('Motorola', 'motorola', 3),
  ('Xiaomi',   'xiaomi',   4)
ON CONFLICT (slug) DO NOTHING;

-- ─── Itens de serviço — iPhone ──────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 16 Pro', 'Troca de tela', 580.00, 'Tela OLED original com garantia de 90 dias', 1, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 16 Pro', 'Troca de bateria', 220.00, 'Bateria original com garantia de 6 meses', 2, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 16 Pro', 'Reparo de carregador', 140.00, 'Limpeza e reparo da porta Lightning/USB-C', 3, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 15 Pro', 'Troca de tela', 520.00, 'Tela OLED original com garantia de 90 dias', 4, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 15 Pro', 'Troca de bateria', 200.00, 'Bateria original com garantia de 6 meses', 5, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 15 Pro', 'Troca de câmera traseira', 350.00, 'Módulo de câmera original', 6, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 14 Pro', 'Troca de tela', 480.00, 'Tela OLED original com garantia de 90 dias', 7, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 14 Pro', 'Troca de bateria', 190.00, 'Bateria original com garantia de 6 meses', 8, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 14 Pro', 'Reparo de carregador', 130.00, 'Limpeza e reparo da porta USB-C', 9, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 14', 'Troca de tela', 420.00, 'Tela OLED original com garantia de 90 dias', 10, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 14', 'Troca de bateria', 175.00, 'Bateria original com garantia de 6 meses', 11, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 13', 'Troca de tela', 380.00, 'Tela OLED original com garantia de 90 dias', 12, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 13', 'Troca de bateria', 160.00, 'Bateria original com garantia de 6 meses', 13, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 13', 'Reparo de conector de carregador', 120.00, 'Limpeza e reparo da porta Lightning', 14, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 12', 'Troca de tela', 320.00, 'Tela OLED original com garantia de 90 dias', 15, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 12', 'Troca de bateria', 145.00, 'Bateria original com garantia de 6 meses', 16, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 11', 'Troca de tela', 280.00, 'Tela LCD original com garantia de 90 dias', 17, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone 11', 'Troca de bateria', 130.00, 'Bateria original com garantia de 6 meses', 18, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone XR', 'Troca de tela', 240.00, 'Tela LCD original com garantia de 90 dias', 19, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'iPhone XR', 'Troca de bateria', 120.00, 'Bateria original com garantia de 6 meses', 20, true FROM vrtech.service_catalog_categories WHERE slug = 'iphone'
ON CONFLICT DO NOTHING;

-- ─── Itens de serviço — Samsung ─────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S24 Ultra', 'Troca de tela', 620.00, 'Display Dynamic AMOLED original', 1, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S24 Ultra', 'Troca de bateria', 240.00, 'Bateria original com garantia de 6 meses', 2, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S24', 'Troca de tela', 480.00, 'Display AMOLED original', 3, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S24', 'Troca de bateria', 200.00, 'Bateria original com garantia de 6 meses', 4, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S23', 'Troca de tela', 420.00, 'Display AMOLED original', 5, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy S23', 'Troca de bateria', 185.00, 'Bateria original com garantia de 6 meses', 6, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A55', 'Troca de tela', 280.00, 'Display Super AMOLED original', 7, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A55', 'Troca de bateria', 150.00, 'Bateria original com garantia de 6 meses', 8, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A55', 'Reparo de carregador', 110.00, 'Limpeza e reparo da porta USB-C', 9, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A35', 'Troca de tela', 240.00, 'Display Super AMOLED original', 10, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A35', 'Troca de bateria', 130.00, 'Bateria original com garantia de 6 meses', 11, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A15', 'Troca de tela', 180.00, 'Display AMOLED original', 12, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Galaxy A15', 'Troca de bateria', 110.00, 'Bateria original com garantia de 6 meses', 13, true FROM vrtech.service_catalog_categories WHERE slug = 'samsung'
ON CONFLICT DO NOTHING;

-- ─── Itens de serviço — Motorola ────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G85', 'Troca de tela', 250.00, 'Display pOLED original', 1, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G85', 'Troca de bateria', 130.00, 'Bateria original com garantia de 6 meses', 2, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G84', 'Troca de tela', 220.00, 'Display pOLED original', 3, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G84', 'Troca de bateria', 120.00, 'Bateria original com garantia de 6 meses', 4, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G54', 'Troca de tela', 190.00, 'Display IPS LCD original', 5, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G54', 'Troca de bateria', 110.00, 'Bateria original com garantia de 6 meses', 6, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G54', 'Reparo de carregador', 90.00, 'Limpeza e reparo da porta USB-C', 7, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G34', 'Troca de tela', 160.00, 'Display IPS LCD original', 8, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto G34', 'Troca de bateria', 100.00, 'Bateria original com garantia de 6 meses', 9, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto E22', 'Troca de tela', 130.00, 'Display IPS LCD original', 10, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Moto E22', 'Troca de bateria', 90.00, 'Bateria original com garantia de 6 meses', 11, true FROM vrtech.service_catalog_categories WHERE slug = 'motorola'
ON CONFLICT DO NOTHING;

-- ─── Itens de serviço — Xiaomi ──────────────────────────────────────────────

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Xiaomi 14', 'Troca de tela', 380.00, 'Display AMOLED original', 1, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Xiaomi 14', 'Troca de bateria', 180.00, 'Bateria original com garantia de 6 meses', 2, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Redmi Note 13', 'Troca de tela', 220.00, 'Display AMOLED original', 3, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Redmi Note 13', 'Troca de bateria', 120.00, 'Bateria original com garantia de 6 meses', 4, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Redmi Note 13', 'Reparo de carregador', 95.00, 'Limpeza e reparo da porta USB-C', 5, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Redmi 12', 'Troca de tela', 180.00, 'Display IPS LCD original', 6, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'Redmi 12', 'Troca de bateria', 100.00, 'Bateria original com garantia de 6 meses', 7, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'POCO X6', 'Troca de tela', 260.00, 'Display AMOLED original', 8, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, sort_order, active)
SELECT id, 'POCO X6', 'Troca de bateria', 140.00, 'Bateria original com garantia de 6 meses', 9, true FROM vrtech.service_catalog_categories WHERE slug = 'xiaomi'
ON CONFLICT DO NOTHING;

-- ─── Produtos (loja) ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_cat_iphone UUID;
  v_cat_samsung UUID;
  v_cat_acessorios UUID;
BEGIN
  -- Categorias de produto
  INSERT INTO vrtech.product_categories (name) VALUES ('iPhone') ON CONFLICT (name) DO NOTHING;
  INSERT INTO vrtech.product_categories (name) VALUES ('Samsung') ON CONFLICT (name) DO NOTHING;
  INSERT INTO vrtech.product_categories (name) VALUES ('Acessórios') ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_cat_iphone   FROM vrtech.product_categories WHERE name = 'iPhone';
  SELECT id INTO v_cat_samsung  FROM vrtech.product_categories WHERE name = 'Samsung';
  SELECT id INTO v_cat_acessorios FROM vrtech.product_categories WHERE name = 'Acessórios';

  -- Produtos iPhone
  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Capinha iPhone 14 Pro', 'Capinha transparente anti-impacto', 25.00, 15, v_cat_iphone, 'iPhone', 'iPhone 14 Pro', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Película iPhone 14 Pro', 'Película de vidro temperado 9H', 15.00, 30, v_cat_iphone, 'iPhone', 'iPhone 14 Pro', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Carregador iPhone USB-C 20W', 'Carregador rápido compatível com MagSafe', 45.00, 10, v_cat_iphone, 'iPhone', 'iPhone 14/15', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Capinha iPhone 13', 'Capinha silicone premium antiderrapante', 22.00, 12, v_cat_iphone, 'iPhone', 'iPhone 13', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Película iPhone 13', 'Película de vidro temperado 9H', 12.00, 25, v_cat_iphone, 'iPhone', 'iPhone 13', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Cabo Lightning 1m', 'Cabo reforçado nylon trançado MFi', 28.00, 20, v_cat_iphone, 'iPhone', 'Todos iPhone', true)
  ON CONFLICT DO NOTHING;

  -- Produtos Samsung
  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Capinha Galaxy A55', 'Capinha transparente anti-impacto', 20.00, 18, v_cat_samsung, 'Samsung', 'Galaxy A55', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Película Galaxy A55', 'Película de vidro temperado 9H', 12.00, 35, v_cat_samsung, 'Samsung', 'Galaxy A55', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Capinha Galaxy S24', 'Capinha couro sintético premium', 35.00, 8, v_cat_samsung, 'Samsung', 'Galaxy S24', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Carregador Samsung 25W', 'Carregador rápido Super Fast Charge', 40.00, 12, v_cat_samsung, 'Samsung', 'Linha Galaxy', true)
  ON CONFLICT DO NOTHING;

  -- Acessórios gerais
  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Fone Bluetooth TWS', 'Fone sem fio com cancelamento de ruído', 89.00, 5, v_cat_acessorios, NULL, NULL, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Suporte Veicular Magnético', 'Suporte magnético 360° para painel', 35.00, 8, v_cat_acessorios, NULL, NULL, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO vrtech.products (name, description, price, quantity, category_id, phone_brand, phone_model, active)
  VALUES ('Cabo USB-C 2m', 'Cabo USB-C nylon trançado carga rápida 65W', 22.00, 30, v_cat_acessorios, NULL, NULL, true)
  ON CONFLICT DO NOTHING;

END $$;
