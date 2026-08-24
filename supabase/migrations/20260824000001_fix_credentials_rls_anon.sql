-- O dashboard nunca autentica contra o Supabase do vrtech de verdade (auth
-- é por sessão própria da app, não Supabase Auth) -- toda escrita do
-- painel roda como `anon`, não `authenticated`. A policy "src_auth_only"
-- só liberava `authenticated`, então salvar a senha do cliente (PIN/padrão)
-- sempre falhava silenciosamente com erro de RLS -- mesma classe de bug já
-- corrigida em outras tabelas nesta sessão.
GRANT ALL ON vrtech.service_request_credentials TO anon;

DROP POLICY IF EXISTS "src_auth_only" ON vrtech.service_request_credentials;
CREATE POLICY "src_anon_and_auth" ON vrtech.service_request_credentials
  FOR ALL USING (true) WITH CHECK (true);
