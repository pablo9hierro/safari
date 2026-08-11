-- Alinha o storage do OAuth Mercado Pago com o padrão usado pelos lojistas
-- do Resolutoo (subscribers.plataforma_credenciais): também precisamos saber
-- se o token conectado é de produção ou sandbox (Mercado Pago devolve isso
-- em "live_mode" na troca do OAuth) — hoje o vrtech não distinguia.

ALTER TABLE vrtech.mercadopago_config
  ADD COLUMN IF NOT EXISTS connection_status TEXT
    CHECK (connection_status IN ('production', 'sandbox'));
