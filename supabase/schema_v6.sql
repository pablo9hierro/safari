-- =====================================================
-- VR Tech v6 — Execute no SQL Editor do Supabase
-- Remove o status 'quoted' (Orçado) — fundido em 'accepted'
-- =====================================================

-- 1. Migra solicitações que ainda estão como 'quoted' para 'accepted'
UPDATE service_requests SET status = 'accepted' WHERE status = 'quoted';

-- 2. Atualiza o CHECK constraint removendo 'quoted'
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending', 'accepted', 'rejected',
    'retirada_local', 'em_busca', 'in_progress', 'em_entrega',
    'completed', 'cancelled'
  ));
