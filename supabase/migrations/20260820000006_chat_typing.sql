-- Suporte a /dashboard/chat (chat ao vivo no painel) e às regras de
-- "esperar parar de digitar" antes da IA responder -- tanto quando é o
-- CLIENTE que está digitando/gravando áudio no WhatsApp (presence.update da
-- Evolution API) quanto quando é o LOJISTA digitando na caixa de texto do
-- /chat (heartbeat de typing local).
ALTER TABLE vrtech.assistant_conversations
  ADD COLUMN IF NOT EXISTS customer_typing_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lojista_typing_until TIMESTAMPTZ;
