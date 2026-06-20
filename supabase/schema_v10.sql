-- =====================================================
-- VR Tech v10 — Execute no SQL Editor do Supabase
-- Permite reabrir uma Ordem de Serviço já concluída
-- =====================================================

-- Libera o novo tipo de evento 'reopened' na timeline da OS
-- (usado quando o admin reabre uma OS concluída para atualizar dados)
ALTER TABLE service_order_updates DROP CONSTRAINT IF EXISTS service_order_updates_action_type_check;

ALTER TABLE service_order_updates ADD CONSTRAINT service_order_updates_action_type_check
  CHECK (action_type IN ('created', 'checklist_update', 'update', 'completed', 'reopened'));
