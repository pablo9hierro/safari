-- Posição ao vivo do lojista/motoboy enquanto está em rota de coleta ou
-- entrega -- loja de um técnico só, então uma linha fixa (id='default')
-- já basta, sem precisar amarrar em qual atendimento especificamente.
-- Painel lê isso pra desenhar o mapa "tipo Uber" em cada card de
-- coleta/entrega em andamento.
CREATE TABLE IF NOT EXISTS vrtech.driver_location (
  id          text PRIMARY KEY DEFAULT 'default',
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vrtech.driver_location ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão do resto do painel: nunca autentica de verdade contra este
-- Supabase (sessão é da app, não Supabase Auth), então roda como anon.
GRANT ALL ON vrtech.driver_location TO anon, authenticated;

DROP POLICY IF EXISTS "driver_location_anon_and_auth" ON vrtech.driver_location;
CREATE POLICY "driver_location_anon_and_auth" ON vrtech.driver_location
  FOR ALL USING (true) WITH CHECK (true);
