-- Amplia os tipos de agendamento pra cobrir o pipeline inteiro do serviço:
-- coleta do aparelho no cliente, retirada pelo cliente na loja e entrega
-- pelo lojista — os três, além do agendamento de atendimento em si (service),
-- usam a MESMA agenda (mesma disponibilidade/bloqueios/conflitos), só
-- distinguidos pelo tipo.

ALTER TABLE vrtech.appointments DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;
ALTER TABLE vrtech.appointments ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type IN ('service', 'device_collection', 'device_delivery', 'device_pickup'));
