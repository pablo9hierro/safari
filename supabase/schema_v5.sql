-- =====================================================
-- VR Tech v5 — Execute no SQL Editor do Supabase
-- Endereço por bairro (João Pessoa) + Ordem de Serviço
-- =====================================================

-- 1. CEP deixa de ser obrigatório (endereço agora é bairro + rua + número + referência)
ALTER TABLE service_requests ALTER COLUMN address_cep DROP NOT NULL;

-- 2. Novo status 'retirada_local' (cliente leva/retira o aparelho na loja)
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending', 'quoted', 'accepted', 'rejected',
    'retirada_local', 'em_busca', 'in_progress', 'em_entrega',
    'completed', 'cancelled'
  ));

-- =====================================================
-- 3. Ordem de serviço (OS) — atrelada 1:1 à solicitação
-- =====================================================

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Checklist de componentes: [{ component, checked, description }]
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Preenchido ao concluir o reparo
  completed_services TEXT,
  warranty TEXT,
  final_value NUMERIC(10, 2),
  pdf_url TEXT,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_orders_request_id ON service_orders(request_id);

-- Log de atualizações da OS (timeline em tempo real)
CREATE TABLE IF NOT EXISTS service_order_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  message TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL DEFAULT 'update'
    CHECK (action_type IN ('created', 'checklist_update', 'update', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_service_order_updates_order_id ON service_order_updates(service_order_id);
CREATE INDEX IF NOT EXISTS idx_service_order_updates_created_at ON service_order_updates(created_at);

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_updates ENABLE ROW LEVEL SECURITY;

-- Dono (autenticado no dashboard) gerencia tudo
DROP POLICY IF EXISTS "owner_all_service_orders" ON service_orders;
CREATE POLICY "owner_all_service_orders" ON service_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "owner_all_service_order_updates" ON service_order_updates;
CREATE POLICY "owner_all_service_order_updates" ON service_order_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Leitura pública (cliente acompanha em /consultar em tempo real)
DROP POLICY IF EXISTS "public_read_service_orders" ON service_orders;
CREATE POLICY "public_read_service_orders" ON service_orders
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_service_order_updates" ON service_order_updates;
CREATE POLICY "public_read_service_order_updates" ON service_order_updates
  FOR SELECT TO anon, authenticated USING (true);

-- =====================================================
-- Atualiza a busca por telefone para incluir o bairro
-- =====================================================

DROP FUNCTION IF EXISTS search_requests_by_phone(text);

CREATE OR REPLACE FUNCTION search_requests_by_phone(phone_digits TEXT)
RETURNS TABLE (
  id           uuid,
  created_at   timestamptz,
  phone_model  text,
  problem_description text,
  address_cep  text,
  address_number text,
  address_street text,
  address_neighborhood text,
  address_city text,
  status       text,
  quote_value  numeric,
  owner_notes  text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    id, created_at, phone_model, problem_description,
    address_cep, address_number, address_street, address_neighborhood, address_city,
    status, quote_value, owner_notes
  FROM service_requests
  WHERE regexp_replace(customer_phone, '[^0-9]', '', 'g')
        LIKE '%' || regexp_replace(phone_digits, '[^0-9]', '', 'g') || '%'
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION search_requests_by_phone TO anon, authenticated;

-- =====================================================
-- Storage: bucket 'service-order-media' (cria via SQL, sem precisar
-- usar a tela de Storage do dashboard)
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('service-order-media', 'service-order-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "auth_upload_service_order_media" ON storage.objects;
CREATE POLICY "auth_upload_service_order_media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'service-order-media');

DROP POLICY IF EXISTS "public_read_service_order_media" ON storage.objects;
CREATE POLICY "public_read_service_order_media" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'service-order-media');
