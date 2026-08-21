-- Serviço vendido no PDV passa a virar um agendamento de verdade (mesma
-- agenda usada pelo WhatsApp/vitrine), não mais uma "solicitação já
-- concluída" fake. requested_scheduled_at: horário escolhido pelo lojista
-- no momento da venda (NULL = pega o próximo horário livre automaticamente).
-- appointment_id: rastreio do agendamento real criado ao concluir a venda.
ALTER TABLE vrtech.pdv_sale_items
  ADD COLUMN IF NOT EXISTS requested_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES vrtech.appointments(id) ON DELETE SET NULL;
