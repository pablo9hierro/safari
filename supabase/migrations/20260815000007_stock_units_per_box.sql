-- Quando o item de estoque é cadastrado por caixa (unit = 'caixa'), o
-- lojista precisa dizer quantas unidades vêm dentro de cada caixa.
ALTER TABLE vrtech.stock_items
  ADD COLUMN IF NOT EXISTS units_per_box NUMERIC;
