-- status_completed teve o CONTEUDO atualizado (migration anterior) pra
-- pedir retirada/entrega, mas o label/description que aparecem no card de
-- /dashboard/template-zap continuaram "Reparo concluído" -- nada ali
-- amarra visualmente esse disparo ao status "Pronto" que o Kanban agora
-- usa (ver STATUS_GROUP_LABEL/STATUS_CONFIG). Lojista abrindo Template Zap
-- não tinha como achar qual card corresponde ao fluxo de "pronto".
UPDATE vrtech.whatsapp_templates
SET
  label = 'Pronto — combinar entrega/retirada',
  description = 'Disparada quando o reparo fica pronto (status "Pronto" no Kanban de Solicitações) -- avisa o cliente e pede pra combinar retirada ou entrega.'
WHERE tenant_id = 'vrtech'
  AND template_key = 'status_completed';
