-- Tags de busca (palavras-chave + frases-chave) por produto/serviço,
-- geradas por IA. Guiam a assistente/algoritmo de busca a encontrar o
-- item certo mesmo quando o cliente descreve o problema em vez de citar o
-- nome exato (ex: "carregador que carrega rápido" -> tag "carregamento
-- rápido" no produto certo). Nunca aparecem soltas/escondidas no HTML da
-- vitrine -- ficam dentro de um accordion recolhido por padrão no card
-- (interação real do usuário pra abrir), não display:none nem CSS
-- offscreen -- ver AccordionTags no frontend.
ALTER TABLE vrtech.products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE vrtech.service_catalog_items ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
