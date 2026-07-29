-- Adiciona image_url a service_catalog_items e service_catalog_categories
-- e atualiza registros existentes com imagens públicas

ALTER TABLE vrtech.service_catalog_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE vrtech.service_catalog_categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Imagens por marca (categories)
UPDATE vrtech.service_catalog_categories SET image_url = 'https://picsum.photos/seed/apple-iphone-repair/600/400' WHERE slug = 'iphone';
UPDATE vrtech.service_catalog_categories SET image_url = 'https://picsum.photos/seed/samsung-galaxy-repair/600/400' WHERE slug = 'samsung';
UPDATE vrtech.service_catalog_categories SET image_url = 'https://picsum.photos/seed/motorola-moto-repair/600/400' WHERE slug = 'motorola';
UPDATE vrtech.service_catalog_categories SET image_url = 'https://picsum.photos/seed/xiaomi-redmi-repair/600/400' WHERE slug = 'xiaomi';

-- Imagens por modelo — iPhone
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone16pro/400/400'  WHERE model_name = 'iPhone 16 Pro';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone15pro/400/400'  WHERE model_name = 'iPhone 15 Pro';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone14pro/400/400'  WHERE model_name = 'iPhone 14 Pro';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone14/400/400'     WHERE model_name = 'iPhone 14';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone13/400/400'     WHERE model_name = 'iPhone 13';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone12/400/400'     WHERE model_name = 'iPhone 12';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphone11/400/400'     WHERE model_name = 'iPhone 11';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/iphonexr/400/400'     WHERE model_name = 'iPhone XR';

-- Imagens por modelo — Samsung
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxys24ultra/400/400' WHERE model_name = 'Galaxy S24 Ultra';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxys24/400/400'      WHERE model_name = 'Galaxy S24';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxys23/400/400'      WHERE model_name = 'Galaxy S23';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxya55/400/400'      WHERE model_name = 'Galaxy A55';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxya35/400/400'      WHERE model_name = 'Galaxy A35';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/galaxya15/400/400'      WHERE model_name = 'Galaxy A15';

-- Imagens por modelo — Motorola
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/motog85/400/400' WHERE model_name = 'Moto G85';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/motog84/400/400' WHERE model_name = 'Moto G84';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/motog54/400/400' WHERE model_name = 'Moto G54';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/motog34/400/400' WHERE model_name = 'Moto G34';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/motoe22/400/400' WHERE model_name = 'Moto E22';

-- Imagens por modelo — Xiaomi
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/xiaomi14/400/400'      WHERE model_name = 'Xiaomi 14';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/redminote13/400/400'   WHERE model_name = 'Redmi Note 13';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/redmi12/400/400'       WHERE model_name = 'Redmi 12';
UPDATE vrtech.service_catalog_items SET image_url = 'https://picsum.photos/seed/pocox6/400/400'        WHERE model_name = 'POCO X6';
