-- Fluxo enxuto do painel: mídia no diagnóstico (OS1), timer de ocupação,
-- senha do cliente (colapsável), "Diagnóstico" como serviço cadastrado
-- (tempo próprio, influencia a agenda), realtime pro preview ao vivo.

-- ─── Mídia no diagnóstico (OS1) ──────────────────────────────────────────────
-- OS2 (service_order_updates) já tem media_urls text[] -- espelha aqui.
ALTER TABLE vrtech.service_diagnostics
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

-- ─── Timer de ocupação (bloqueia agenda enquanto o atendimento roda) ────────
ALTER TABLE vrtech.service_requests
  ADD COLUMN IF NOT EXISTS busy_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_vrt_sr_busy_until ON vrtech.service_requests(busy_until)
  WHERE busy_until IS NOT NULL;

-- ─── Senha do cliente (PIN ou padrão de desenho) ────────────────────────────
-- Dado sensível: RLS restrita a authenticated (lojista) -- nunca lido pelo
-- cliente via /consultar nem pela IA (ambos usam a service key ou anon,
-- não authenticated).
CREATE TABLE IF NOT EXISTS vrtech.service_request_credentials (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id  uuid NOT NULL UNIQUE
    REFERENCES vrtech.service_requests(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('pin', 'pattern')),
  value               text NOT NULL,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vrt_src_request_id ON vrtech.service_request_credentials(service_request_id);

GRANT ALL ON vrtech.service_request_credentials TO authenticated, service_role;

ALTER TABLE vrtech.service_request_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "src_auth_only" ON vrtech.service_request_credentials;
CREATE POLICY "src_auth_only" ON vrtech.service_request_credentials
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── "Diagnóstico" como serviço cadastrado no catálogo ──────────────────────
-- Não é amarrado a marca/modelo (é o mesmo procedimento pra qualquer
-- aparelho) -- entra numa categoria própria, editável pelo lojista no
-- mesmo admin de catálogo que os demais serviços (preço, duração, ativo).
INSERT INTO vrtech.service_catalog_categories (name, slug, sort_order)
VALUES ('Diagnóstico', 'diagnostico', 0)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO vrtech.service_catalog_items (category_id, model_name, repair_type, price, description, duration_minutes, sort_order)
SELECT c.id, 'Diagnóstico geral', 'Diagnóstico', 0, 'Avaliação técnica do aparelho antes do orçamento de reparo.', 30, 0
FROM vrtech.service_catalog_categories c
WHERE c.slug = 'diagnostico'
  AND NOT EXISTS (
    SELECT 1 FROM vrtech.service_catalog_items i
    WHERE i.category_id = c.id AND i.repair_type = 'Diagnóstico'
  );

-- ─── Realtime: preview ao vivo do diagnóstico/OS no /consultar ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'vrtech' AND tablename = 'service_diagnostics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.service_diagnostics;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'vrtech' AND tablename = 'service_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.service_orders;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'vrtech' AND tablename = 'service_order_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.service_order_updates;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'vrtech' AND tablename = 'service_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vrtech.service_requests;
  END IF;
END $$;
