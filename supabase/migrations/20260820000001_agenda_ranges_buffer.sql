-- Reformula disponibilidade de agenda: grade fixa (slot_minutes) vira
-- faixas contínuas calculadas em tempo real; horário de funcionamento passa
-- a admitir múltiplos blocos por dia (manhã/tarde); novo buffer obrigatório
-- entre agendamentos; libera a agenda automaticamente quando o reparo é
-- marcado concluído (não precisa mais chamar /complete manualmente).

-- =============================================================================
-- Horário de funcionamento: 1 linha/dia -> N linhas/dia (múltiplos blocos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vrtech.agenda_business_hours_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  CHECK (close_time > open_time)
);
CREATE INDEX IF NOT EXISTS idx_agenda_business_hours_v2_weekday
  ON vrtech.agenda_business_hours_v2(weekday);

-- Migra os dados existentes: dia "closed" = nenhuma linha (ausência = fechado).
INSERT INTO vrtech.agenda_business_hours_v2 (weekday, open_time, close_time)
SELECT weekday, open_time, close_time
FROM vrtech.agenda_business_hours
WHERE NOT closed
ON CONFLICT DO NOTHING;

ALTER TABLE vrtech.agenda_business_hours RENAME TO agenda_business_hours_old;
ALTER TABLE vrtech.agenda_business_hours_v2 RENAME TO agenda_business_hours;

-- =============================================================================
-- agenda_settings: sai slot_minutes (grade fixa não existe mais), entra
-- buffer_minutes (folga obrigatória entre agendamentos e a partir de "agora").
-- default_duration_minutes fica só como fallback interno (serviço avulso sem
-- catálogo / agendamento device_*), nunca mais é "a" duração do agendamento.
-- =============================================================================
ALTER TABLE vrtech.agenda_settings
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0);

ALTER TABLE vrtech.agenda_settings DROP COLUMN IF EXISTS slot_minutes;

-- =============================================================================
-- Auto-liberação da agenda: um agendamento tipo 'service' vinculado a uma
-- service_request some da ocupação assim que o reparo é marcado concluído
-- (completed/em_pagamento), sem precisar de ação manual na tela de agenda.
-- Trigger no banco em vez de código de aplicação porque service_requests.status
-- é escrito em 2+ lugares diferentes (RequestDetailModal client-side e
-- serviceLifecycle/store.ts) — um trigger cobre os dois sem depender de
-- lembrar de chamar completeAppointment() em cada caminho de escrita.
-- =============================================================================
ALTER TABLE vrtech.appointment_events DROP CONSTRAINT IF EXISTS appointment_events_actor_type_check;
ALTER TABLE vrtech.appointment_events ADD CONSTRAINT appointment_events_actor_type_check
  CHECK (actor_type IN ('assistente', 'admin', 'cliente', 'sistema'));

CREATE OR REPLACE FUNCTION vrtech.fn_release_agenda_on_repair_done()
RETURNS trigger AS $$
DECLARE
  appt vrtech.appointments%ROWTYPE;
  now_ts TIMESTAMPTZ := now();
  effective_end TIMESTAMPTZ;
BEGIN
  IF NEW.status IN ('completed', 'em_pagamento')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR appt IN
      SELECT * FROM vrtech.appointments
      WHERE service_request_id = NEW.id
        AND appointment_type = 'service'
        AND status IN ('agendado', 'remarcado')
    LOOP
      effective_end := LEAST(appt.ends_at, GREATEST(appt.starts_at, now_ts));

      UPDATE vrtech.appointments
        SET status = 'concluido',
            ends_at = effective_end,
            updated_at = now_ts
        WHERE id = appt.id;

      INSERT INTO vrtech.appointment_events
        (appointment_id, action, actor_type, actor_id, justification,
         previous_starts_at, previous_ends_at, new_starts_at, new_ends_at)
      VALUES
        (appt.id, 'completed', 'sistema', NULL,
         'Liberado automaticamente: reparo marcado como concluído.',
         appt.starts_at, appt.ends_at, appt.starts_at, effective_end);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_agenda_on_repair_done ON vrtech.service_requests;
CREATE TRIGGER trg_release_agenda_on_repair_done
  AFTER UPDATE OF status ON vrtech.service_requests
  FOR EACH ROW EXECUTE FUNCTION vrtech.fn_release_agenda_on_repair_done();

-- =============================================================================
-- RLS da nova tabela — mesmo padrão das demais.
-- =============================================================================
ALTER TABLE vrtech.agenda_business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc_agenda_business_hours" ON vrtech.agenda_business_hours;
DROP POLICY IF EXISTS "auth_agenda_business_hours" ON vrtech.agenda_business_hours;
CREATE POLICY "svc_agenda_business_hours" ON vrtech.agenda_business_hours
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_agenda_business_hours" ON vrtech.agenda_business_hours
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON vrtech.agenda_business_hours TO service_role, authenticated;

-- Tabela antiga fica pra trás só como histórico de auditoria (não é mais
-- lida por código nenhum) — dropar manualmente depois de confirmar em
-- produção que a migração dos dados ficou correta.
