-- Perna de volta do aparelho (entrega ao cliente vs. retirada na loja),
-- decidida dinamicamente pelo cliente via assistente quando o reparo fica
-- pronto — independente de ter havido coleta ou não. Preço da perna de volta
-- só é somado ao valor final quando ela é efetivamente decidida (nunca antes
-- da entrega), separado do preço da coleta (`shipping_price`, já cobrado na
-- conclusão do reparo há mais tempo).
ALTER TABLE vrtech.service_requests
  ADD COLUMN IF NOT EXISTS return_leg TEXT
    CHECK (return_leg IS NULL OR return_leg IN ('pickup_store', 'delivery_home')),
  ADD COLUMN IF NOT EXISTS return_leg_price NUMERIC,
  ADD COLUMN IF NOT EXISTS return_leg_same_address BOOLEAN;
