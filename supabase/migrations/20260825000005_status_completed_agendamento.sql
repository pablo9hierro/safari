-- status_completed ("reparo pronto") nunca pedia pro cliente combinar a
-- retirada/entrega -- só avisava que terminou e ficava esperando o cliente
-- adivinhar o próximo passo. Nova variável /retirada_ou_entrega (calculada
-- server-side a partir de self_pickup, ver requestVars em
-- src/app/api/whatsapp/notify/route.ts) deixa explícito qual pergunta fazer,
-- e o texto novo puxa a resposta do cliente pro fluxo de agendamento que já
-- existe (agendar_entrega_aparelho/agendar_retirada_aparelho).
UPDATE vrtech.whatsapp_templates
SET
  content = E'Seu aparelho */aparelho* foi reparado com sucesso! 🎉\nServiços realizados: /servicos\nOrçamento no valor de: /valor\nGarantia do serviço: /garantia\nOrdem de serviço: /link_os\n\nJá pode combinar /retirada_ou_entrega -- me diga o melhor horário que a gente agenda certinho.',
  available_variables = '{/nome,/aparelho,/servicos,/valor,/garantia,/link_os,/retirada_ou_entrega}'
WHERE tenant_id = 'vrtech'
  AND template_key = 'status_completed'
  AND content NOT LIKE '%retirada_ou_entrega%';
