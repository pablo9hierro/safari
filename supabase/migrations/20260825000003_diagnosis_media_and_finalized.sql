-- Diagnóstico ganha um estado "prévia" (lojista ainda ajustando, cliente já
-- pode ver como está em /consultar) separado de "finalizado" (só aí o botão
-- de download libera pro cliente) -- hoje o fluxo era um único passo (gerar
-- + enviar), sem meio-termo. DEFAULT true porque todo diagnóstico já
-- existente foi criado por esse fluxo antigo (sempre "final" quando salvo)
-- -- não pode retroativamente perder o download por causa desta migration.
ALTER TABLE vrtech.service_diagnostics
  ADD COLUMN IF NOT EXISTS finalized BOOLEAN NOT NULL DEFAULT true;

-- media_urls TEXT[] já existe (20260821000001_painel_enxuto.sql) mas nunca
-- foi usada em código -- este ALTER é só documentação/no-op (IF NOT EXISTS),
-- a coluna real já está lá.
ALTER TABLE vrtech.service_diagnostics
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] NOT NULL DEFAULT '{}';
