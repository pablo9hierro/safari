-- =====================================================
-- VR Tech v17 — Execute no SQL Editor do Supabase
-- Atualizações da OS (OS2) passam a ser vinculadas a um
-- componente específico da checklist (OS1)
-- =====================================================

ALTER TABLE service_order_updates ADD COLUMN IF NOT EXISTS component TEXT;
CREATE INDEX IF NOT EXISTS idx_service_order_updates_component ON service_order_updates (service_order_id, component);
