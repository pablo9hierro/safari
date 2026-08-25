-- VRTECH-BUG-009: catalog_models (cadastro mestre de "Modelo") foi
-- contaminado por uma migration antiga (20260821000006) que promoveu
-- model_name de service_catalog_items pra "modelo" sem validar nada --
-- ~20 linhas ali são na verdade DESCRIÇÃO DE SERVIÇO (ex.: "Troca de Tela
-- Samsung Galaxy A54", "Compra de Aparelho Usado"), não nome de aparelho.
-- Isso ficou invisível até a busca de "Modelo" do cadastro de produto
-- começar a listar esse mesmo cadastro mestre.
--
-- ON DELETE CASCADE em service_item_models/product_models remove só o
-- vínculo errado (o serviço/produto continua existindo, só perde uma
-- "compatibilidade de modelo" que nunca fez sentido) -- nenhum dado de
-- serviço/produto em si é apagado aqui. service_catalog_items.model_name
-- (coluna de compatibilidade legada, texto solto) não é tocado por esta
-- migration -- ele se auto-corrige na próxima vez que o serviço for salvo
-- pela tela (ressincroniza a partir do modelo selecionado, já limpo).

DELETE FROM vrtech.catalog_models
WHERE name ~* '^(troca|reparo|conserto|manuten[cç][aã]o|formata[cç][aã]o|avalia[cç][aã]o|compra|entrega|instala[cç][aã]o|atualiza[cç][aã]o|backup|diagn[oó]stico|limpeza|revis[aã]o|or[cç]amento)(\s|$)';

-- Blindagem permanente: nenhum "Modelo" novo pode começar com um verbo de
-- serviço, nunca mais -- mesma classe de erro do bug, agora impossível de
-- reintroduzir mesmo por SQL direto ou um código futuro que pule a
-- validação client-side (ver src/lib/catalogModelGuard.ts, regex espelhado).
ALTER TABLE vrtech.catalog_models
  ADD CONSTRAINT catalog_models_name_not_service_phrase
  CHECK (name !~* '^(troca|reparo|conserto|manuten[cç][aã]o|formata[cç][aã]o|avalia[cç][aã]o|compra|entrega|instala[cç][aã]o|atualiza[cç][aã]o|backup|diagn[oó]stico|limpeza|revis[aã]o|or[cç]amento)(\s|$)');
