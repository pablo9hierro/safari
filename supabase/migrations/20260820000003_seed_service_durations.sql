-- Duração dos serviços estava toda uniforme em 60min (valor do DEFAULT da
-- migration que tornou a coluna NOT NULL) -- nunca foi ajustada por
-- serviço de verdade. Agora que a duração real do serviço é o que ocupa a
-- agenda (ver 20260820000001_agenda_ranges_buffer.sql), isso passa a ter
-- efeito direto no cliente. Estimativas por categoria (texto de
-- model_name/repair_type/description), aplicadas em ordem de prioridade —
-- casos mais específicos primeiro. São estimativas de mercado pra assistência
-- técnica de celular; o lojista pode ajustar cada serviço manualmente depois
-- em /dashboard/produtos.
UPDATE vrtech.service_catalog_items SET duration_minutes = CASE
  WHEN model_name ILIKE '%placa%' OR description ILIKE '%placa-mãe%' OR description ILIKE '%curto%' OR description ILIKE '%não liga%'
    THEN 150  -- diagnóstico + reparo de placa-mãe é o serviço mais demorado
  WHEN model_name ILIKE '%formatação%' OR model_name ILIKE '%backup%'
    THEN 90
  WHEN model_name ILIKE '%manutenção preventiva%'
    THEN 60
  WHEN model_name ILIKE '%notebook%' AND (model_name ILIKE '%tela%' OR description ILIKE '%tela%')
    THEN 90
  WHEN model_name ILIKE '%tablet%' AND (model_name ILIKE '%tela%' OR description ILIKE '%tela%')
    THEN 75
  WHEN model_name ILIKE '%avaliação%' OR model_name ILIKE '%compra de aparelho%'
    THEN 20
  WHEN model_name ILIKE '%entrega de%'
    THEN 15
  WHEN model_name ILIKE '%flash%' OR model_name ILIKE '%câmera%' OR repair_type ILIKE '%câmera%'
    THEN 45
  WHEN model_name ILIKE '%bateria%' OR repair_type ILIKE '%bateria%'
    THEN 30
  WHEN model_name ILIKE '%carregador%' OR model_name ILIKE '%conector%' OR repair_type ILIKE '%carregador%' OR repair_type ILIKE '%conector%'
    THEN 45
  WHEN model_name ILIKE '%tela%' OR repair_type ILIKE '%tela%'
    THEN 60
  ELSE 60
END;
