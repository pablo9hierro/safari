-- =====================================================
-- VR Tech v18 — Execute no SQL Editor do Supabase
-- Cliente pode marcar que vai levar/buscar o aparelho
-- ele mesmo, sem precisar informar endereço
-- =====================================================

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS self_pickup BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE service_requests ALTER COLUMN address_number DROP NOT NULL;
ALTER TABLE service_requests ALTER COLUMN address_reference DROP NOT NULL;
