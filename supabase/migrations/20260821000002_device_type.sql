-- Tipo de aparelho (celular/tablet/notebook/computador) -- nova dimensão
-- acima de marca, pro wizard do checkout (ícone > marca > modelo). Vive na
-- categoria (marca), já que uma marca inteira pertence a um tipo só.
ALTER TABLE vrtech.service_catalog_categories
  ADD COLUMN IF NOT EXISTS device_type text NOT NULL DEFAULT 'celular'
    CHECK (device_type IN ('celular', 'tablet', 'notebook', 'computador', 'outro'));

-- Categorias existentes (iPhone/Samsung/Motorola/Xiaomi) são todas de
-- celular -- já cobertas pelo DEFAULT. "Diagnóstico" não é um aparelho
-- (é um serviço avulso, ver 20260821000001) -- marcado 'outro' pra nunca
-- aparecer no wizard de tipo/marca/modelo.
UPDATE vrtech.service_catalog_categories SET device_type = 'outro' WHERE slug = 'diagnostico';
