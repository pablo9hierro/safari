-- Fluxo pendente->coleta: orçamento estimado (falado na coleta) separado do
-- orçamento real (só existe após diagnóstico) -- comparação decide se o
-- atendimento avança sozinho pro reparo ou espera aprovação do cliente.

ALTER TABLE vrtech.service_requests
  ADD COLUMN IF NOT EXISTS estimated_quote_value numeric;

-- Ativo/inativo por template -- cada card em /dashboard/template-zap ganha
-- um toggle controlando se aquele disparo específico acontece.
ALTER TABLE vrtech.whatsapp_templates
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- Reescreve os dois templates de orçamento pós-diagnóstico pro teor pedido.
-- Só atualiza content/available_variables (não mexe em quem já editou o
-- label/description/section) -- se o lojista já tiver customizado o texto,
-- isso sobrescreve; é aceitável aqui porque a feature de orçamento real
-- comparado ao estimado é nova, o texto anterior nunca refletia essa lógica.
UPDATE vrtech.whatsapp_templates
SET content = E'Olá *\/nome*! 👋\n\nFinalizamos o diagnóstico do seu *\/aparelho*.\n\nO orçamento real do serviço \/servicos ficou em \/valor.\n\nSegue o PDF com os detalhes. Podemos seguir para o reparo com esse valor?',
    available_variables = '{/nome,/aparelho,/servicos,/valor}',
    updated_at = now()
WHERE template_key = 'status_diagnostico_enviado' AND tenant_id = 'vrtech';

UPDATE vrtech.whatsapp_templates
SET content = E'✅ Orçamento pós-diagnóstico confirmado: \/valor, exatamente como informado.\n\nJá estamos seguindo com o reparo do seu *\/aparelho*.\n\n⏱ Tempo estimado de conclusão: \/tempo_estimado.',
    available_variables = '{/nome,/aparelho,/valor,/tempo_estimado,/link_acompanhamento}',
    updated_at = now()
WHERE template_key = 'status_in_progress' AND tenant_id = 'vrtech';
