-- VR Tech — Migration v4
-- Fluxo de diagnóstico: novos campos em service_requests, tabela service_diagnostics, novos status

-- ─── Novos campos em service_requests ───────────────────────────────────────

ALTER TABLE vrtech.service_requests
  ALTER COLUMN phone_model DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS selected_service_ids uuid[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS diagnosis_requested  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_quote      numeric(10,2);

-- ─── Novos status: aguardando_diagnostico, diagnostico_enviado ───────────────
-- Dropar o CHECK antigo e recriar com os valores extras.

ALTER TABLE vrtech.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE vrtech.service_requests
  ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'rejected',
    'retirada_local',
    'em_busca',
    'in_progress',
    'em_entrega',
    'completed',
    'em_pagamento',
    'delivered',
    'finished',
    'cancelled',
    'aguardando_diagnostico',
    'diagnostico_enviado'
  ));

-- ─── Tabela de diagnósticos ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vrtech.service_diagnostics (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id  uuid NOT NULL REFERENCES vrtech.service_requests(id) ON DELETE CASCADE,
  services_selected   jsonb NOT NULL DEFAULT '[]',
  notes               text,
  pdf_url             text,
  quote_confirmed     numeric(10,2),
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_sd_request_id ON vrtech.service_diagnostics(service_request_id);

GRANT ALL ON vrtech.service_diagnostics TO anon, authenticated, service_role;

ALTER TABLE vrtech.service_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diag_select" ON vrtech.service_diagnostics;
CREATE POLICY "diag_select" ON vrtech.service_diagnostics
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "diag_auth_all" ON vrtech.service_diagnostics;
CREATE POLICY "diag_auth_all" ON vrtech.service_diagnostics
  FOR ALL USING (auth.role() = 'authenticated');
