-- PDV (venda presencial no painel) — produto e/ou serviço, com múltiplas
-- formas de pagamento (split). Pix fica pra depois (precisa da credencial
-- do Mercado Pago do lojista, que hoje só existe no ufersin-api); cartão e
-- dinheiro são confirmação manual do lojista.

CREATE TABLE IF NOT EXISTS vrtech.pdv_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'cancelada')),
  total_value NUMERIC NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vrtech.pdv_sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES vrtech.pdv_sales(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
  -- SET NULL na exclusão do catálogo pra não perder o histórico da venda —
  -- por isso o nome/preço ficam congelados aqui, não vêm de join.
  product_id UUID REFERENCES vrtech.products(id) ON DELETE SET NULL,
  service_id UUID REFERENCES vrtech.service_catalog_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  -- Serviço vendido no PDV vira uma service_requests (mesma fila do
  -- lojista) — preenchido depois que a venda é criada.
  service_request_id UUID REFERENCES vrtech.service_requests(id) ON DELETE SET NULL,
  stock_deducted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_pdv_sale_items_sale ON vrtech.pdv_sale_items(sale_id);

CREATE TABLE IF NOT EXISTS vrtech.pdv_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES vrtech.pdv_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('pix', 'cartao', 'dinheiro')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'cancelado')),
  installments INTEGER CHECK (installments IS NULL OR installments >= 1),
  change_amount NUMERIC CHECK (change_amount IS NULL OR change_amount >= 0),
  mp_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pdv_payments_sale ON vrtech.pdv_payments(sale_id);

ALTER TABLE vrtech.pdv_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.pdv_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.pdv_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pdv_sales', 'pdv_sale_items', 'pdv_payments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "svc_%s" ON vrtech.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_%s" ON vrtech.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "svc_%s" ON vrtech.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    EXECUTE format(
      'CREATE POLICY "auth_%s" ON vrtech.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT ALL ON vrtech.%I TO service_role, authenticated', t);
  END LOOP;
END $$;
