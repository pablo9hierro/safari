-- Fallback chain de modelos de IA da assistente: em vez de um único
-- provider/model/api_key fixo em assistant_config, a loja pode cadastrar N
-- modelos ordenados por prioridade (0 = ativo/preferencial). Quando o
-- modelo em uso falha de forma PERMANENTE (chave inválida, sem crédito,
-- modelo removido — nunca um timeout/erro de rede pontual), a chamada
-- seguinte tenta o próximo da lista automaticamente. Ver src/lib/assistant/aiClient.ts.
CREATE TABLE IF NOT EXISTS vrtech.ai_model_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'openrouter')),
  model_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  label TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_configs_priority
  ON vrtech.ai_model_configs(priority) WHERE enabled = true;

ALTER TABLE vrtech.ai_model_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc_ai_model_configs" ON vrtech.ai_model_configs;
CREATE POLICY "svc_ai_model_configs" ON vrtech.ai_model_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_ai_model_configs" ON vrtech.ai_model_configs;
CREATE POLICY "auth_ai_model_configs" ON vrtech.ai_model_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON vrtech.ai_model_configs TO service_role, authenticated;

-- Seed: o modelo já configurado hoje em assistant_config vira o registro de
-- prioridade 0 (padrão), preservando o comportamento atual sem exigir que o
-- lojista recadastre nada.
INSERT INTO vrtech.ai_model_configs (provider, model_id, api_key, label, priority, enabled)
SELECT
  CASE WHEN ac.ai_provider IN ('openai', 'openrouter') THEN ac.ai_provider ELSE 'openai' END,
  COALESCE(NULLIF(ac.ai_model, ''), 'gpt-4o-mini'),
  COALESCE(ac.api_key, ''),
  'OpenAI (padrão)',
  0,
  true
FROM vrtech.assistant_config ac
WHERE ac.id = 'default'
  AND NOT EXISTS (SELECT 1 FROM vrtech.ai_model_configs);
