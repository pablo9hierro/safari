-- Liga a agenda ao ciclo de vida da assistência técnica: agendamento de
-- ENTREGA do aparelho (distinto de agendamento de SERVIÇO/reparo), vinculado
-- à solicitação original — e só permitido depois que o reparo termina.

ALTER TABLE vrtech.appointments
  ADD COLUMN IF NOT EXISTS appointment_type TEXT NOT NULL DEFAULT 'service'
    CHECK (appointment_type IN ('service', 'device_delivery')),
  ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES vrtech.service_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_request ON vrtech.appointments(service_request_id);
