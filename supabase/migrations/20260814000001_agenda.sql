-- Agenda de serviços — fonte única de verdade compartilhada entre a Assistente IA
-- (tool calling) e o painel admin /dashboard/agenda.
--
-- Regra central: agendamento existe SÓ para serviço. Produto nunca entra aqui.
-- A proteção contra dois agendamentos no mesmo horário é do BANCO (constraint
-- EXCLUDE sobre o intervalo), não da aplicação nem da IA — duas requisições
-- simultâneas pro mesmo slot resultam em exatamente uma aceita.

-- =============================================================================
-- Configuração da agenda (linha única, mesmo padrão de assistant_config)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.agenda_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  -- Feature flag: enquanto false, as tools de agenda nem são oferecidas à IA.
  -- Hoje este deploy atende uma loja só (VR Tech); quando a agenda for
  -- generalizada, esta tabela ganha tenant_id e vira multi-linha sem
  -- reescrever o módulo (o código já lê a config por id).
  appointment_ai_enabled BOOLEAN NOT NULL DEFAULT false,
  slot_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_minutes > 0),
  default_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (default_duration_minutes > 0),
  -- Antecedência mínima pra agendar (0 = permite "agora").
  lead_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (lead_time_minutes >= 0),
  -- Quantos dias pra frente a IA pode oferecer.
  max_advance_days INTEGER NOT NULL DEFAULT 60 CHECK (max_advance_days > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO vrtech.agenda_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Horário de funcionamento por dia da semana (0=domingo ... 6=sábado)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.agenda_business_hours (
  weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  closed BOOLEAN NOT NULL DEFAULT false,
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '18:00',
  CHECK (close_time > open_time)
);

-- Seg–Sex 09–18, Sáb 09–13, Dom fechado.
INSERT INTO vrtech.agenda_business_hours (weekday, closed, open_time, close_time) VALUES
  (0, true,  '09:00', '18:00'),
  (1, false, '09:00', '18:00'),
  (2, false, '09:00', '18:00'),
  (3, false, '09:00', '18:00'),
  (4, false, '09:00', '18:00'),
  (5, false, '09:00', '18:00'),
  (6, false, '09:00', '13:00')
ON CONFLICT (weekday) DO NOTHING;

-- =============================================================================
-- Bloqueios pontuais (feriado, almoço, manutenção) — contam como indisponível
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.agenda_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_agenda_blocks_range ON vrtech.agenda_blocks(starts_at, ends_at);

-- =============================================================================
-- Agendamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Serviço do catálogo. SET NULL na exclusão do catálogo pra não perder o
  -- histórico do agendamento — por isso o nome fica congelado em service_label.
  service_id UUID REFERENCES vrtech.service_catalog_items(id) ON DELETE SET NULL,
  service_label TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado','remarcado','cancelado','concluido','nao_compareceu')),
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'assistente' CHECK (created_by IN ('assistente','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON vrtech.appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON vrtech.appointments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON vrtech.appointments(status, starts_at);

-- Anti double-booking no BANCO. Só agendamentos vivos ('agendado'/'remarcado')
-- ocupam o horário — cancelado/concluído libera o slot naturalmente.
-- Sem btree_gist porque não há coluna de igualdade no predicado (single-store).
ALTER TABLE vrtech.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE vrtech.appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('agendado','remarcado'));

-- =============================================================================
-- Auditoria — nada é apagado, toda transição vira um evento
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.appointment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES vrtech.appointments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','rescheduled','cancelled','completed','no_show')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('assistente','admin','cliente')),
  actor_id TEXT,
  -- Obrigatória (>= 20 chars) em remarcação/cancelamento feitos pelo admin;
  -- validado na aplicação porque a origem do ator não existe no nível da linha.
  justification TEXT,
  previous_starts_at TIMESTAMPTZ,
  previous_ends_at TIMESTAMPTZ,
  new_starts_at TIMESTAMPTZ,
  new_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_events_appt
  ON vrtech.appointment_events(appointment_id, created_at DESC);

-- =============================================================================
-- RLS — mesmo padrão das demais tabelas do schema vrtech
-- =============================================================================
ALTER TABLE vrtech.agenda_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.agenda_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.agenda_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrtech.appointment_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda_settings','agenda_business_hours','agenda_blocks',
    'appointments','appointment_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "svc_%s" ON vrtech.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_%s" ON vrtech.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "svc_%s" ON vrtech.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    EXECUTE format(
      'CREATE POLICY "auth_%s" ON vrtech.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT ALL ON vrtech.%I TO service_role, authenticated', t);
  END LOOP;
END $$;
