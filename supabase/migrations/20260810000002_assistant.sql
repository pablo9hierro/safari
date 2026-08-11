-- Assistente IA — tabelas internas ao schema vrtech

CREATE TABLE IF NOT EXISTS vrtech.assistant_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT false,
  prompt_interpreter TEXT NOT NULL DEFAULT '',
  prompt_validator TEXT NOT NULL DEFAULT '',
  start_keywords TEXT[] NOT NULL DEFAULT ARRAY['oi','olá','ola','atendimento','quero comprar','pedido'],
  end_keywords TEXT[] NOT NULL DEFAULT ARRAY['tchau','encerrar'],
  window_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  message_batch_window_seconds INTEGER NOT NULL DEFAULT 8,
  min_response_chars INTEGER NOT NULL DEFAULT 150,
  max_response_chars INTEGER NOT NULL DEFAULT 300,
  ai_provider TEXT NOT NULL DEFAULT 'openai',
  ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  api_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vrtech.assistant_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  human_override BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_asst_conv_phone ON vrtech.assistant_conversations(phone) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS vrtech.assistant_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES vrtech.assistant_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('cliente','assistente','humano')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asst_msg_conv ON vrtech.assistant_messages(conversation_id, created_at);

ALTER TABLE vrtech.assistant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_assistant_config" ON vrtech.assistant_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_assistant_config" ON vrtech.assistant_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "svc_assistant_conversations" ON vrtech.assistant_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_assistant_conversations" ON vrtech.assistant_conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "svc_assistant_messages" ON vrtech.assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_assistant_messages" ON vrtech.assistant_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON vrtech.assistant_config TO service_role, authenticated;
GRANT ALL ON vrtech.assistant_conversations TO service_role, authenticated;
GRANT ALL ON vrtech.assistant_messages TO service_role, authenticated;

-- Seed inicial (prompts e api_key inseridos pelo lojista via /dashboard/assistente-ia)
INSERT INTO vrtech.assistant_config (id, enabled, ai_provider, ai_model, start_keywords, end_keywords)
VALUES ('default', false, 'openai', 'gpt-4o-mini', ARRAY['oi','olá','atendimento'], ARRAY['encerrar'])
ON CONFLICT (id) DO NOTHING;
