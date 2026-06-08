-- =====================================================
-- TechFix - Schema do banco de dados (Supabase)
-- Execute este SQL no SQL Editor do Supabase
-- =====================================================

-- Tabela principal de solicitações de serviço
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Dados do cliente
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,

  -- Dados do celular
  phone_model TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  image_url TEXT,

  -- Endereço
  address_cep TEXT NOT NULL,
  address_number TEXT NOT NULL,
  address_reference TEXT NOT NULL,
  address_street TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,

  -- Dados do atendimento
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'quoted', 'accepted', 'rejected', 'in_progress', 'completed')),
  quote_value NUMERIC(10, 2),
  owner_notes TEXT
);

-- Índice para filtrar por status
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at DESC);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode INSERIR (clientes enviando formulário)
CREATE POLICY "public_insert" ON service_requests
  FOR INSERT TO anon
  WITH CHECK (true);

-- Apenas usuários autenticados (dono) podem VER e ATUALIZAR
CREATE POLICY "owner_select" ON service_requests
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "owner_update" ON service_requests
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Storage bucket para imagens
-- =====================================================

-- Crie o bucket 'service-images' no Supabase Storage:
-- 1. Vá em Storage > New bucket
-- 2. Nome: service-images
-- 3. Public bucket: SIM
-- 4. Adicione as policies abaixo:

-- Policy para upload público (anon pode fazer upload)
-- INSERT policy: bucket_id = 'service-images' → allow for anon

-- Policy para leitura pública
-- SELECT policy: bucket_id = 'service-images' → allow for all
