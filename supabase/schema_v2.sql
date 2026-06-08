-- =====================================================
-- TechFix v2 — Execute no SQL Editor do Supabase
-- =====================================================

-- Tabela para estado do WhatsApp (QR code + conexão)
CREATE TABLE IF NOT EXISTS whatsapp_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'connecting', 'disconnected')),
  qr_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_state ENABLE ROW LEVEL SECURITY;

-- Só o dono (autenticado) pode ver o estado do WhatsApp
CREATE POLICY "auth_read_whatsapp" ON whatsapp_state
  FOR SELECT TO authenticated USING (true);

-- O whatsapp-service usa service role key (bypassa RLS)
-- Não precisa de policy adicional para UPDATE/INSERT
