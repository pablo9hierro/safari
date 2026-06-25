-- =====================================================
-- VR Tech v15 — Execute no SQL Editor do Supabase
-- Novo status "em_pagamento" + forma(s) de pagamento e desconto
-- na solicitação + garantia obrigatória no cadastro de peça
-- =====================================================

-- ─── 1. Novo status "em_pagamento" (entre "completed" e "delivered"/"em_entrega") ───
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending', 'accepted', 'rejected',
    'retirada_local', 'em_busca', 'in_progress', 'em_entrega',
    'completed', 'em_pagamento', 'delivered', 'finished', 'cancelled'
  ));

-- ─── 2. Desconto (%) e formas de pagamento da solicitação ───
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS discount_percent INTEGER;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_discount_percent_range;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_discount_percent_range
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── 3. Garantia da peça de estoque (preenchida no cadastro dinâmico durante a OS) ───
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS warranty TEXT;
