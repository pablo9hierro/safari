-- "Novo chat" em /dashboard/chat: permite o lojista simular um atendimento
-- de WhatsApp de dentro do painel, passando pelo MESMO pipeline de IA
-- (mesmo endpoint, mesma lógica de keyword/janela/tools) que uma mensagem
-- real -- só a entrega final via Evolution API que falha silenciosamente
-- (número sintético não existe no WhatsApp de verdade, já é best-effort).
-- is_test marca a conversa pra distinguir visualmente no painel e permitir
-- excluir esses testes de métricas reais no futuro.
ALTER TABLE vrtech.assistant_conversations ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
