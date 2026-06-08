-- =====================================================
-- TechFix v3 — Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Atualiza constraint de status para incluir novos valores
ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending', 'quoted', 'accepted', 'rejected',
    'em_busca', 'in_progress', 'em_entrega',
    'completed', 'cancelled'
  ));

-- 2. Função para buscar solicitações por telefone (ignora formatação)
--    Strip todos os não-dígitos antes de comparar.
CREATE OR REPLACE FUNCTION search_requests_by_phone(phone_digits TEXT)
RETURNS TABLE (
  id           uuid,
  created_at   timestamptz,
  phone_model  text,
  problem_description text,
  address_cep  text,
  address_number text,
  address_street text,
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
    address_cep, address_number, address_street, address_city,
    status, quote_value, owner_notes
  FROM service_requests
  WHERE regexp_replace(customer_phone, '[^0-9]', '', 'g')
        LIKE '%' || regexp_replace(phone_digits, '[^0-9]', '', 'g') || '%'
  ORDER BY created_at DESC;
$$;

-- Permite que qualquer role chame a função (service role já bypassa RLS)
GRANT EXECUTE ON FUNCTION search_requests_by_phone TO anon, authenticated;
