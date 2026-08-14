-- Duração do serviço — é o que define quanto tempo o agendamento ocupa a agenda.
--
-- IMPORTANTE: a duração cobre o ciclo inteiro do atendimento —
-- coleta do aparelho + manutenção + entrega do aparelho — e não apenas o
-- tempo de bancada. Um serviço de 40 min agendado às 09:00 deixa a agenda
-- ocupada de 09:00 até 09:40.

ALTER TABLE vrtech.service_catalog_items
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Serviços que já existiam ficam com 60 min até o lojista revisar; sem isso
-- o NOT NULL abaixo falharia no catálogo atual.
UPDATE vrtech.service_catalog_items SET duration_minutes = 60 WHERE duration_minutes IS NULL;

ALTER TABLE vrtech.service_catalog_items
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN duration_minutes SET DEFAULT 60;

ALTER TABLE vrtech.service_catalog_items
  DROP CONSTRAINT IF EXISTS service_catalog_items_duration_positive;
ALTER TABLE vrtech.service_catalog_items
  ADD CONSTRAINT service_catalog_items_duration_positive
  CHECK (duration_minutes > 0 AND duration_minutes <= 1440);

-- =============================================================================
-- Ajustes da agenda para o fluxo de atendimento da loja
-- =============================================================================

-- Cliente não pode agendar "pra agora": é preciso uma folga mínima entre o
-- horário atual e o início do atendimento. A assistente já oferece a primeira
-- vaga considerando essa folga, então o cliente nunca chega a ver um horário
-- que não daria tempo de cumprir.
ALTER TABLE vrtech.agenda_settings
  ALTER COLUMN lead_time_minutes SET DEFAULT 30;
UPDATE vrtech.agenda_settings SET lead_time_minutes = 30
 WHERE id = 'default' AND lead_time_minutes = 0;

-- A loja agenda apenas para hoje e amanhã.
ALTER TABLE vrtech.agenda_settings
  ALTER COLUMN max_advance_days SET DEFAULT 1;
UPDATE vrtech.agenda_settings SET max_advance_days = 1 WHERE id = 'default';

-- Quem bloqueou o horário e por quê. A justificativa é interna: o cliente,
-- ao consultar a agenda, vê apenas que o horário está indisponível.
ALTER TABLE vrtech.agenda_blocks
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'admin';
