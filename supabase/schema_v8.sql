-- =====================================================
-- VR Tech v8 — Execute no SQL Editor do Supabase
-- Garante o bucket de Storage 'service-order-media' e suas
-- policies, necessário para a geração/visualização/download
-- do PDF da Ordem de Serviço.
-- Seguro para rodar mesmo que o bucket já exista.
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('service-order-media', 'service-order-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "auth_upload_service_order_media" ON storage.objects;
CREATE POLICY "auth_upload_service_order_media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'service-order-media');

DROP POLICY IF EXISTS "auth_update_service_order_media" ON storage.objects;
CREATE POLICY "auth_update_service_order_media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'service-order-media');

DROP POLICY IF EXISTS "public_read_service_order_media" ON storage.objects;
CREATE POLICY "public_read_service_order_media" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'service-order-media');
