-- Mesma classe de bug já documentada em 20260816000001_fix_dashboard_rls_anon.sql
-- e 20260821000007_fix_catalog_rls_anon.sql: o dashboard nunca autentica
-- contra o projeto Supabase do vrtech, então TODA leitura/escrita
-- client-side (inclusive a subscription de Realtime usada por
-- /dashboard/chat pra mensagens aparecerem sozinhas na tela) roda como
-- role `anon`, nunca `authenticated`. As policies de assistant_config/
-- assistant_conversations/assistant_messages só liberavam
-- service_role/authenticated -- Realtime nunca disparava pro anon
-- (RLS bloqueia o INSERT no publish), só reload funcionava (vai pela API
-- route, que usa service_role).

DROP POLICY IF EXISTS "auth_assistant_config" ON vrtech.assistant_config;
CREATE POLICY "auth_assistant_config" ON vrtech.assistant_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_assistant_conversations" ON vrtech.assistant_conversations;
CREATE POLICY "auth_assistant_conversations" ON vrtech.assistant_conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_assistant_messages" ON vrtech.assistant_messages;
CREATE POLICY "auth_assistant_messages" ON vrtech.assistant_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON vrtech.assistant_config TO anon;
GRANT ALL ON vrtech.assistant_conversations TO anon;
GRANT ALL ON vrtech.assistant_messages TO anon;
