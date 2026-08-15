-- Serviço de deslocamento (ex-"Frete", /dashboard/servicodeslocamento):
-- o preço por km é cobrado por PERNA (trecho), não mais "ida + volta"
-- embutido — cada perna (coleta e/ou entrega) é uma decisão independente do
-- cliente, como passagens de ida e volta separadas. cobrar_coleta/
-- cobrar_entrega deixam o lojista desligar a cobrança de uma perna
-- específica (ex: só cobra entrega, coleta é cortesia) sem afetar a outra.
ALTER TABLE vrtech.shipping_settings
  ADD COLUMN IF NOT EXISTS cobrar_coleta BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cobrar_entrega BOOLEAN NOT NULL DEFAULT true;
