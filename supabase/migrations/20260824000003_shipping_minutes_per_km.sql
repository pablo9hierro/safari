-- Tempo de deslocamento estimado (minutos por km) -- usado junto com a
-- distância até o cliente pra informar um ETA de coleta/entrega, tanto no
-- painel quanto em /consultar (mapa ao vivo).
ALTER TABLE vrtech.shipping_settings ADD COLUMN IF NOT EXISTS minutes_per_km numeric NOT NULL DEFAULT 3;
