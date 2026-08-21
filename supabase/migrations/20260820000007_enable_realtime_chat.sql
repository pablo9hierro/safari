-- Nenhuma tabela deste projeto tinha Realtime habilitado até agora (nem
-- assistant_messages, nem nada) -- confirmado via
-- pg_publication_tables/supabase_realtime vazio. /dashboard/chat depende de
-- receber INSERT em tempo real (mensagem do cliente e resposta da IA/lojista
-- aparecendo sozinhas na tela), então precisa entrar na publicação.
ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.assistant_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.assistant_conversations;
