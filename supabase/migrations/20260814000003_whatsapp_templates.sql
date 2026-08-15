-- Template Zap — textos das mensagens automáticas enviadas ao cliente.
--
-- Antes disso os textos viviam hardcoded em src/lib/whatsapp/messages.ts. Esta
-- tabela passa a ser a origem deles; o código mantém os textos originais como
-- fallback, então nenhum disparo quebra se um template ainda não existir aqui.
--
-- Variáveis usam o formato `/nome`, substituído no momento do envio pelo mesmo
-- renderer que alimenta o preview da tela — preview e mensagem real nunca
-- divergem porque não há duas implementações.

CREATE TABLE IF NOT EXISTS vrtech.whatsapp_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Este deploy atende uma loja só; a coluna existe para a feature já nascer
  -- isolada por tenant quando for generalizada.
  tenant_id TEXT NOT NULL DEFAULT 'vrtech',
  template_key TEXT NOT NULL,
  section TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  required_variables TEXT[] NOT NULL DEFAULT '{}',
  available_variables TEXT[] NOT NULL DEFAULT '{}',
  -- Falso para conteúdo cuja edição quebraria o fluxo (ex.: a mensagem que
  -- carrega o link de pagamento gerado pelo sistema).
  editable BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_tenant ON vrtech.whatsapp_templates(tenant_id, section, sort_order);

ALTER TABLE vrtech.whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc_whatsapp_templates" ON vrtech.whatsapp_templates;
DROP POLICY IF EXISTS "auth_whatsapp_templates" ON vrtech.whatsapp_templates;
CREATE POLICY "svc_whatsapp_templates" ON vrtech.whatsapp_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_whatsapp_templates" ON vrtech.whatsapp_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON vrtech.whatsapp_templates TO service_role, authenticated;

-- =============================================================================
-- Migração dos textos que já existiam, para a página abrir preenchida.
-- ON CONFLICT DO NOTHING: reaplicar a migration não sobrescreve edição do lojista.
-- =============================================================================
INSERT INTO vrtech.whatsapp_templates
  (template_key, section, label, description, content, required_variables, available_variables, editable, sort_order)
VALUES
  -- ---------------------------------------------------------------- Solicitação
  ('request_pending', 'Solicitação de serviço', 'Solicitação recebida',
   'Enviada ao cliente assim que ele abre a solicitação de serviço.',
   E'Recebemos sua solicitação de serviço da VR Tech! 👋\n\nEm breve te informo o orçamento inicial (pode variar pelo estado do aparelho quando analisado).',
   '{}', '{/nome,/telefone,/aparelho,/problema}', true, 0),

  ('status_aguardando_diagnostico', 'Status do atendimento', 'Aguardando diagnóstico',
   'Aparelho recebido, avaliação ainda não concluída.',
   E'Olá *\/nome*! 👋\n\nRecebemos seu aparelho para diagnóstico. Em breve finalizamos a avaliação e te enviamos um orçamento detalhado pelo WhatsApp.\n\nObrigado pela confiança! 🙏',
   '{/nome}', '{/nome,/aparelho,/problema}', true, 1),

  ('status_diagnostico_enviado', 'Status do atendimento', 'Diagnóstico enviado',
   'Orçamento detalhado enviado ao cliente.',
   E'Olá *\/nome*! 👋\n\nFinalizamos o diagnóstico do seu *\/aparelho* e preparamos um orçamento detalhado.\n\nSegue o PDF com os serviços identificados e valores. Confirma o orçamento para darmos início ao reparo?',
   '{/nome}', '{/nome,/aparelho,/valor}', true, 2),

  ('status_accepted', 'Status do atendimento', 'Orçamento aceito',
   'Cliente aceitou o orçamento; pedimos a localização para a coleta.',
   E'Olá *\/nome*! 👋\n\nSeu orçamento para o *\/aparelho* ficou em \/valor.\n\nAgradecemos pela preferência em nosso serviço! 🙏\n\nPor favor, compartilhe a sua localização fixa através do WhatsApp (clique no clipe 📎 → Localização → Sua localização atual).\n\nEm breve recolheremos o aparelho celular para dar continuidade ao serviço.',
   '{/nome,/valor}', '{/nome,/aparelho,/valor}', true, 3),

  ('status_rejected', 'Status do atendimento', 'Orçamento recusado',
   'Cliente recusou o orçamento.',
   E'Entendemos, *\/nome*. 😊\n\nSe mudar de ideia ou precisar de outro serviço, pode nos chamar aqui a qualquer momento!',
   '{/nome}', '{/nome,/aparelho}', true, 4),

  ('status_retirada_local', 'Entrega e coleta', 'Retirada na loja',
   'Cliente optou por levar/retirar o aparelho na loja.',
   E'Deseja trazer ou retirar o aparelho em nosso endereço?\n\n📍 \/endereco\n\/mapa',
   '{}', '{/nome,/endereco,/mapa}', true, 0),

  ('status_em_busca', 'Entrega e coleta', 'Indo buscar o aparelho',
   'Localização recebida; a loja saiu para a coleta.',
   E'🛵 Recebemos sua localização e estamos iniciando a busca do seu aparelho celular.',
   '{}', '{/nome,/aparelho}', true, 1),

  ('status_in_progress', 'Status do atendimento', 'Em reparo',
   'Manutenção em andamento.',
   E'🔧 Seu aparelho celular está sendo reparado neste momento.\n\nAcompanhe qualquer atualização do serviço em tempo real através do link:\n\/link_acompanhamento',
   '{}', '{/nome,/aparelho,/link_acompanhamento}', true, 5),

  ('status_em_entrega', 'Entrega e coleta', 'Saiu para entrega',
   'Aparelho a caminho do endereço do cliente.',
   E'📦 *Seu aparelho está a caminho!*\n\nOlá *\/nome*! Acabamos de sair com o *\/aparelho* para entrega no seu endereço.\n\nEm breve chegamos! 🛵',
   '{/nome}', '{/nome,/aparelho}', true, 2),

  ('status_completed', 'Status do atendimento', 'Reparo concluído',
   'Serviço finalizado, com garantia e ordem de serviço.',
   E'Seu aparelho *\/aparelho* foi reparado com sucesso! 🎉\nServiços realizados: \/servicos\nOrçamento no valor de: \/valor\nGarantia do serviço: \/garantia\nOrdem de serviço: \/link_os',
   '{}', '{/nome,/aparelho,/servicos,/valor,/garantia,/link_os}', true, 6),

  ('status_delivered', 'Entrega e coleta', 'Aparelho entregue',
   'Entrega confirmada.',
   E'📬 Aparelho entregue!\n\nAgradecemos a confiança, *\/nome*! Caso precise de algo, estamos à disposição.',
   '{/nome}', '{/nome,/aparelho}', true, 3),

  ('status_finished', 'Status do atendimento', 'Atendimento concluído',
   'Encerramento do atendimento.',
   E'✅ Atendimento concluído.\n\nAgradecemos a confiança, *\/nome*! Caso precise de algo, estamos à disposição.',
   '{/nome}', '{/nome,/aparelho}', true, 7),

  ('status_cancelled', 'Status do atendimento', 'Atendimento cancelado',
   'Solicitação cancelada.',
   E'*\/nome*, sua solicitação para o *\/aparelho* foi cancelada.\n\nSe mudar de ideia, pode nos chamar aqui a qualquer momento! 😊',
   '{/nome}', '{/nome,/aparelho}', true, 8),

  -- ---------------------------------------------------------------- Pedido da loja
  ('store_order_pending', 'Pedidos da loja', 'Pedido recebido',
   'Enviada ao cliente assim que ele finaliza um pedido na vitrine.',
   E'Olá, *\/nome*! 👋\n\nRecebemos seu pedido na loja da VR Tech!\nEm breve nossa equipe continua por aqui mesmo no WhatsApp para fechar os detalhes da compra. 🙏',
   '{/nome}', '{/nome,/pedido,/valor}', true, 0),

  -- ---------------------------------------------------------------- Agenda
  ('appointment_created', 'Agendamentos', 'Atendimento agendado',
   'Confirmação do horário marcado.',
   E'Olá, \/nome! Seu atendimento está agendado. ✅\n\nServiço: \/servico\nData e horário: \/data_hora\n\nSe precisar cancelar ou remarcar, é só responder por aqui.',
   '{/nome,/data_hora}', '{/nome,/servico,/data_hora}', true, 0),

  ('appointment_rescheduled', 'Agendamentos', 'Atendimento remarcado',
   'Avisa o cliente do novo horário. A justificativa do lojista entra literal.',
   E'Olá, \/nome! Precisamos alterar o horário do seu atendimento.\n\nServiço: \/servico\nHorário anterior: \/horario_anterior\nNovo horário: \/data_hora\n\nMotivo: \/motivo\n\nPedimos desculpas pelo transtorno. Se o novo horário não funcionar pra você, é só responder aqui que a gente encontra outro.',
   '{/nome,/data_hora,/motivo}', '{/nome,/servico,/data_hora,/horario_anterior,/motivo}', true, 1),

  ('appointment_cancelled', 'Agendamentos', 'Atendimento cancelado',
   'Avisa o cliente do cancelamento. A justificativa do lojista entra literal.',
   E'Olá, \/nome! Informamos que seu atendimento foi cancelado.\n\nServiço: \/servico\nHorário original: \/data_hora\n\nMotivo: \/motivo\n\nPedimos desculpas pelo transtorno. Se quiser, respondemos aqui mesmo pra encontrar um novo horário.',
   '{/nome,/motivo}', '{/nome,/servico,/data_hora,/motivo}', true, 2),

  -- ---------------------------------------------------------------- Pagamento
  ('payment_intro', 'Pagamentos', 'Aviso de pagamento (mensagem 1)',
   'Texto que antecede a cobrança. É a parte editável do fluxo de pagamento.',
   E'Olá, \/nome! Seu pedido está pronto. 💳\n\nValor: \/valor\n\nLogo abaixo mando o código para você pagar.',
   '{/nome}', '{/nome,/pedido,/valor}', true, 0),

  ('payment_link', 'Pagamentos', 'Cobrança (mensagem 2)',
   'Mensagem seguinte, com o Pix copia-e-cola ou o link de pagamento gerado pelo sistema. Enviada sozinha para o cliente conseguir copiar o código. Não editável — alterar aqui quebraria a cobrança.',
   E'\/link_pagamento',
   '{/link_pagamento}', '{/link_pagamento}', false, 1)
ON CONFLICT (tenant_id, template_key) DO NOTHING;
