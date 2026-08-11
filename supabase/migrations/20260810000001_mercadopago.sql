-- Mercado Pago config (credentials storage) + checkout additions

-- ─── MP CONFIG ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.mercadopago_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT,
  refresh_token TEXT,
  public_key TEXT,
  mp_user_id TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth CSRF states (short-lived, 15 min)
CREATE TABLE IF NOT EXISTS vrtech.mercadopago_oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vrtech.mercadopago_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.mercadopago_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only service role (backend) accesses these
CREATE POLICY "svc_mercadopago_config"
  ON vrtech.mercadopago_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc_mercadopago_oauth_states"
  ON vrtech.mercadopago_oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON vrtech.mercadopago_config TO service_role;
GRANT ALL ON vrtech.mercadopago_oauth_states TO service_role;

-- Seed inicial (credenciais inseridas via dashboard ou env var MP_ACCESS_TOKEN / MP_PUBLIC_KEY)
INSERT INTO vrtech.mercadopago_config (id, status)
VALUES ('default', 'disconnected')
ON CONFLICT (id) DO NOTHING;

-- ─── STORE ORDERS — add payment metadata ────────────────────────────────────

ALTER TABLE vrtech.store_orders
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'manual'
    CHECK (payment_method IN ('pix', 'dinheiro', 'cartao', 'manual'));

-- Drop old status constraint and add 'aguardando_pix' value
ALTER TABLE vrtech.store_orders DROP CONSTRAINT IF EXISTS store_orders_status_check;
ALTER TABLE vrtech.store_orders
  ADD CONSTRAINT store_orders_status_check
  CHECK (status IN ('pendente', 'aguardando_pix', 'pago', 'vendido', 'recusado'));
