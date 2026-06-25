-- =====================================================
-- VR Tech v14 — Execute no SQL Editor do Supabase
-- Galeria de até 3 imagens por produto + peças de estoque
-- usadas no reparo (registradas na conclusão da OS)
-- =====================================================

-- ─── 1. Produtos: galeria de até 3 imagens ──────────────
-- image_urls[0] é sempre a capa, espelhada em image_url (mantém compatibilidade
-- com o restante do código que ainda lê image_url diretamente).
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_image_urls_max3;
ALTER TABLE products ADD CONSTRAINT products_image_urls_max3
  CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 3);

UPDATE products
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND COALESCE(array_length(image_urls, 1), 0) = 0;

-- ─── 2. Estoque: preço unitário ──────────────────────────
-- Usado quando uma peça é cadastrada dinamicamente durante a conclusão da OS.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);

-- ─── 3. OS: peças de estoque utilizadas no reparo ────────
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS used_parts JSONB NOT NULL DEFAULT '[]'::jsonb;
