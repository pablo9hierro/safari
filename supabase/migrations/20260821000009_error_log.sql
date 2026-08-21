-- Módulo de rastreamento de erros: pontos de console.error espalhados pelo
-- código (middleware, API routes, webhooks) também persistem aqui, pra
-- aparecer numa aba do dashboard em vez de só no `vercel logs`. Só erros
-- reais e acionáveis -- degradação intencional documentada (ex: guard de
-- sessão da plataforma quando os DOIS valores, env var e fallback, falham)
-- não é ruído esperado, então também entra; um simples log informativo
-- não.

CREATE TABLE IF NOT EXISTS vrtech.error_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('middleware', 'api', 'client', 'webhook')),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn')),
  message TEXT NOT NULL,
  context JSONB,
  route TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON vrtech.error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_resolved ON vrtech.error_log(resolved) WHERE resolved = false;

-- Nunca exposta ao storefront público -- só o dashboard autenticado (anon,
-- mesma classe de todas as tabelas do painel, ver 20260816000001) e o
-- service_role (inserts vindos de rotas server-side/middleware).
GRANT ALL ON vrtech.error_log TO anon, authenticated, service_role;
ALTER TABLE vrtech.error_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "error_log_all" ON vrtech.error_log;
CREATE POLICY "error_log_all" ON vrtech.error_log FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
