-- =====================================================
-- VR Tech v4 — Execute no SQL Editor do Supabase
-- Corrige erro "new row violates row-level security policy"
-- ao enviar o formulário de solicitação (anon insert)
-- =====================================================

-- 1. Garante que a policy de INSERT público existe em service_requests
DROP POLICY IF EXISTS "public_insert" ON service_requests;

CREATE POLICY "public_insert" ON service_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 2. Policies do bucket de imagens 'service-images'
--    (necessário para o upload de foto do celular funcionar)

DROP POLICY IF EXISTS "anon_upload_service_images" ON storage.objects;
DROP POLICY IF EXISTS "public_read_service_images" ON storage.objects;

CREATE POLICY "anon_upload_service_images" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'service-images');

CREATE POLICY "public_read_service_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'service-images');
