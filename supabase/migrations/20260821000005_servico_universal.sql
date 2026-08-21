-- Serviço "universal" pra marca: model_name vira opcional. NULL significa
-- "vale pra qualquer modelo dessa marca/aparelho" -- category_id (marca, já
-- amarrada a um device_type) continua obrigatório, então o mínimo pra
-- cadastrar um serviço passa a ser aparelho+marca (via categoria), com
-- modelo opcional pra deixar universal.
ALTER TABLE vrtech.service_catalog_items
  ALTER COLUMN model_name DROP NOT NULL;
