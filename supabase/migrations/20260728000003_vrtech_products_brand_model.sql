-- Add phone_brand and phone_model to products for brand/model catalog organization

ALTER TABLE vrtech.products
  ADD COLUMN IF NOT EXISTS phone_brand TEXT,
  ADD COLUMN IF NOT EXISTS phone_model TEXT;
