-- Add store_address text to shipping_settings
ALTER TABLE vrtech.shipping_settings
  ADD COLUMN IF NOT EXISTS store_address TEXT;

-- Add map-based delivery address columns to store_orders
ALTER TABLE vrtech.store_orders
  ADD COLUMN IF NOT EXISTS address_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS address_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS address_label TEXT;
