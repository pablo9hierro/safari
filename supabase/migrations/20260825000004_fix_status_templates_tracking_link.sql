-- status_aguardando_diagnostico nunca citou /link_acompanhamento (nem no
-- seed original) e status_in_progress perdeu a menção quando
-- 20260821000003_orcamento_estimado.sql reescreveu o texto -- cliente
-- avançava pro diagnóstico/reparo sem receber o link de /consultar pra
-- acompanhar. WHERE ... NOT LIKE evita sobrescrever se o lojista já
-- customizou esse texto (edição manual em /dashboard/template-zap).
UPDATE vrtech.whatsapp_templates
SET
  content = E'Olá */nome*! 👋\n\nRecebemos seu aparelho para diagnóstico. Em breve finalizamos a avaliação e te enviamos um orçamento detalhado pelo WhatsApp.\n\nAcompanhe o andamento por aqui:\n/link_acompanhamento\n\nObrigado pela confiança! 🙏',
  required_variables = '{/nome}',
  available_variables = '{/nome,/aparelho,/problema,/link_acompanhamento}'
WHERE tenant_id = 'vrtech'
  AND template_key = 'status_aguardando_diagnostico'
  AND content NOT LIKE '%link_acompanhamento%';

UPDATE vrtech.whatsapp_templates
SET
  content = E'✅ Orçamento pós-diagnóstico confirmado: /valor, exatamente como informado.\n\nJá estamos seguindo com o reparo do seu */aparelho*.\n\n⏱ Tempo estimado de conclusão: /tempo_estimado.\n\nAcompanhe o andamento por aqui:\n/link_acompanhamento',
  available_variables = '{/nome,/aparelho,/valor,/tempo_estimado,/link_acompanhamento}'
WHERE tenant_id = 'vrtech'
  AND template_key = 'status_in_progress'
  AND content NOT LIKE '%link_acompanhamento%';
