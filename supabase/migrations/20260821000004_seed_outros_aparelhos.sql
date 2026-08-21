-- Seed de marcas/modelos/serviços pra tablet, notebook e computador -- até
-- aqui só existia celular (iPhone/Samsung/Motorola/Xiaomi). Mesmo padrão de
-- preço/descrição/duração dos itens já cadastrados.

-- ─── Categorias (marcas) ─────────────────────────────────────────────────
INSERT INTO vrtech.service_catalog_categories (name, slug, device_type, sort_order) VALUES
  ('iPad',            'ipad-tablet',        'tablet',     5),
  ('Samsung Tablet',  'samsung-tablet',     'tablet',     6),
  ('MacBook',         'macbook',            'notebook',   7),
  ('Notebook Dell/Lenovo/HP', 'notebook-outros', 'notebook', 8),
  ('Desktop/PC',      'desktop-pc',         'computador', 9)
ON CONFLICT (slug) DO NOTHING;

-- ─── Itens (modelo + serviço) ────────────────────────────────────────────
DO $$
DECLARE
  cat_ipad uuid;
  cat_samsung_tab uuid;
  cat_macbook uuid;
  cat_notebook uuid;
  cat_desktop uuid;
BEGIN
  SELECT id INTO cat_ipad FROM vrtech.service_catalog_categories WHERE slug = 'ipad-tablet';
  SELECT id INTO cat_samsung_tab FROM vrtech.service_catalog_categories WHERE slug = 'samsung-tablet';
  SELECT id INTO cat_macbook FROM vrtech.service_catalog_categories WHERE slug = 'macbook';
  SELECT id INTO cat_notebook FROM vrtech.service_catalog_categories WHERE slug = 'notebook-outros';
  SELECT id INTO cat_desktop FROM vrtech.service_catalog_categories WHERE slug = 'desktop-pc';

  -- iPad
  INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  SELECT * FROM (VALUES
    (cat_ipad, 'iPad 10ª geração', 'Troca de tela', 480.00, 'Tela original com garantia de 6 meses', 60, 0),
    (cat_ipad, 'iPad 10ª geração', 'Troca de bateria', 260.00, 'Bateria original com garantia de 6 meses', 45, 1),
    (cat_ipad, 'iPad Air', 'Troca de tela', 620.00, 'Tela original com garantia de 6 meses', 75, 2),
    (cat_ipad, 'iPad Air', 'Reparo de carregador', 150.00, 'Limpeza e reparo da porta USB-C', 45, 3),
    (cat_ipad, 'iPad Pro', 'Troca de tela', 890.00, 'Tela original com garantia de 6 meses', 90, 4)
  ) AS v(category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = v.category_id AND i.model_name = v.model_name AND i.repair_type = v.repair_type
  );

  -- Samsung Tablet
  INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  SELECT * FROM (VALUES
    (cat_samsung_tab, 'Galaxy Tab S9', 'Troca de tela', 550.00, 'Tela original com garantia de 6 meses', 75, 0),
    (cat_samsung_tab, 'Galaxy Tab S9', 'Troca de bateria', 230.00, 'Bateria original com garantia de 6 meses', 45, 1),
    (cat_samsung_tab, 'Galaxy Tab A9', 'Troca de tela', 320.00, 'Tela original com garantia de 6 meses', 60, 2),
    (cat_samsung_tab, 'Galaxy Tab A9', 'Reparo de carregador', 120.00, 'Limpeza e reparo da porta USB-C', 40, 3)
  ) AS v(category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = v.category_id AND i.model_name = v.model_name AND i.repair_type = v.repair_type
  );

  -- MacBook
  INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  SELECT * FROM (VALUES
    (cat_macbook, 'MacBook Air M2', 'Troca de tela', 1400.00, 'Tela original com garantia de 6 meses', 120, 0),
    (cat_macbook, 'MacBook Air M2', 'Troca de bateria', 650.00, 'Bateria original com garantia de 6 meses', 90, 1),
    (cat_macbook, 'MacBook Air M2', 'Reparo de teclado', 480.00, 'Substituição do teclado completo', 90, 2),
    (cat_macbook, 'MacBook Pro 13"', 'Troca de tela', 1650.00, 'Tela original com garantia de 6 meses', 120, 3),
    (cat_macbook, 'MacBook Pro 13"', 'Limpeza interna + pasta térmica', 220.00, 'Remoção de poeira, troca de pasta térmica', 60, 4)
  ) AS v(category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = v.category_id AND i.model_name = v.model_name AND i.repair_type = v.repair_type
  );

  -- Notebook Dell/Lenovo/HP (marca genérica -- linha PC não-Apple)
  INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  SELECT * FROM (VALUES
    (cat_notebook, 'Notebook 14"/15" (geral)', 'Troca de tela', 480.00, 'Tela compatível com garantia de 6 meses', 90, 0),
    (cat_notebook, 'Notebook 14"/15" (geral)', 'Troca de bateria', 280.00, 'Bateria compatível com garantia de 6 meses', 60, 1),
    (cat_notebook, 'Notebook 14"/15" (geral)', 'Reparo de teclado', 220.00, 'Substituição do teclado completo', 60, 2),
    (cat_notebook, 'Notebook 14"/15" (geral)', 'Limpeza interna + pasta térmica', 150.00, 'Remoção de poeira, troca de pasta térmica', 45, 3),
    (cat_notebook, 'Notebook 14"/15" (geral)', 'Formatação + backup', 120.00, 'Reinstalação do sistema com backup dos arquivos', 90, 4)
  ) AS v(category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = v.category_id AND i.model_name = v.model_name AND i.repair_type = v.repair_type
  );

  -- Desktop/PC (marca genérica -- montado/OEM)
  INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  SELECT * FROM (VALUES
    (cat_desktop, 'Desktop/PC (geral)', 'Formatação + backup', 130.00, 'Reinstalação do sistema com backup dos arquivos', 90, 0),
    (cat_desktop, 'Desktop/PC (geral)', 'Limpeza interna + pasta térmica', 130.00, 'Remoção de poeira, troca de pasta térmica', 45, 1),
    (cat_desktop, 'Desktop/PC (geral)', 'Troca de fonte', 180.00, 'Diagnóstico e substituição da fonte de alimentação', 60, 2),
    (cat_desktop, 'Desktop/PC (geral)', 'Upgrade de memória/SSD', 100.00, 'Instalação de memória RAM ou SSD (peça à parte)', 45, 3)
  ) AS v(category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = v.category_id AND i.model_name = v.model_name AND i.repair_type = v.repair_type
  );
END $$;
