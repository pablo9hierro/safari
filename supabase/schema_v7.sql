-- =====================================================
-- VR Tech v7 — Execute no SQL Editor do Supabase
-- Adiciona os status 'delivered' (aparelho entregue) e
-- 'finished' (atendimento concluído)
-- =====================================================
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending', 'accepted', 'rejected',
    'retirada_local', 'em_busca', 'in_progress', 'em_entrega',
    'completed', 'delivered', 'finished', 'cancelled'
  ));
