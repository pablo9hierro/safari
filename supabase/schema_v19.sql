-- =====================================================
-- VR Tech v19 — Execute no SQL Editor do Supabase
-- Frete no orçamento; simplificação do formulário de endereço
-- =====================================================

-- Guarda o frete estimado (ida e volta) calculado no momento da solicitação
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS shipping_price NUMERIC;

-- address_street e address_number não são mais coletados no formulário público
-- (já eram nullable desde v18, mas não custa garantir)
ALTER TABLE service_requests ALTER COLUMN address_street DROP NOT NULL;
ALTER TABLE service_requests ALTER COLUMN address_number DROP NOT NULL;
