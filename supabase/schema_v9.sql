-- =====================================================
-- VR Tech v9 — Execute no SQL Editor do Supabase
-- RLS completo: policies para todas as tabelas e
-- buckets de storage que o app usa.
-- Seguro para rodar múltiplas vezes (idempotente).
-- =====================================================

-- ─── 1. RLS nas tabelas ─────────────────────────────

ALTER TABLE public.service_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_state          ENABLE ROW LEVEL SECURITY;

-- ─── 2. service_requests ────────────────────────────
-- Anon insere (formulário da landing page)
DROP POLICY IF EXISTS "anon_insert_service_requests"  ON public.service_requests;
CREATE POLICY "anon_insert_service_requests" ON public.service_requests
  FOR INSERT TO anon WITH CHECK (true);

-- Anon lê (ServiceOrderPanel no /consultar via browser client)
DROP POLICY IF EXISTS "anon_select_service_requests"  ON public.service_requests;
CREATE POLICY "anon_select_service_requests" ON public.service_requests
  FOR SELECT TO anon USING (true);

-- Admin lê todas (dashboard)
DROP POLICY IF EXISTS "auth_select_service_requests"  ON public.service_requests;
CREATE POLICY "auth_select_service_requests" ON public.service_requests
  FOR SELECT TO authenticated USING (true);

-- Admin atualiza (status, quote_value, owner_notes)
DROP POLICY IF EXISTS "auth_update_service_requests"  ON public.service_requests;
CREATE POLICY "auth_update_service_requests" ON public.service_requests
  FOR UPDATE TO authenticated USING (true);

-- ─── 3. service_orders ──────────────────────────────
-- Anon lê (ServiceOrderPanel readOnly no /consultar)
DROP POLICY IF EXISTS "anon_select_service_orders"    ON public.service_orders;
CREATE POLICY "anon_select_service_orders" ON public.service_orders
  FOR SELECT TO anon USING (true);

-- Admin faz tudo (cria OS, atualiza checklist, PDF etc.)
DROP POLICY IF EXISTS "auth_all_service_orders"       ON public.service_orders;
CREATE POLICY "auth_all_service_orders" ON public.service_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 4. service_order_updates ───────────────────────
-- Anon lê (timeline no /consultar)
DROP POLICY IF EXISTS "anon_select_service_order_updates" ON public.service_order_updates;
CREATE POLICY "anon_select_service_order_updates" ON public.service_order_updates
  FOR SELECT TO anon USING (true);

-- Admin faz tudo (adiciona updates, logs de ação)
DROP POLICY IF EXISTS "auth_all_service_order_updates"    ON public.service_order_updates;
CREATE POLICY "auth_all_service_order_updates" ON public.service_order_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 5. whatsapp_state ──────────────────────────────
-- Só o admin lê e atualiza (painel do dashboard)
DROP POLICY IF EXISTS "auth_all_whatsapp_state"       ON public.whatsapp_state;
CREATE POLICY "auth_all_whatsapp_state" ON public.whatsapp_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 6. Storage: service-images ─────────────────────
-- Bucket para fotos do aparelho enviadas no formulário
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anon pode fazer upload (formulário é anônimo)
DROP POLICY IF EXISTS "anon_upload_service_images"    ON storage.objects;
CREATE POLICY "anon_upload_service_images" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'service-images');

-- Leitura pública (exibir foto no dashboard)
DROP POLICY IF EXISTS "public_read_service_images"    ON storage.objects;
CREATE POLICY "public_read_service_images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'service-images');

-- ─── 7. Storage: service-order-media ────────────────
-- Bucket para mídias da OS e PDFs (já criado no v8, idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-order-media', 'service-order-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "auth_upload_service_order_media"  ON storage.objects;
CREATE POLICY "auth_upload_service_order_media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'service-order-media');

DROP POLICY IF EXISTS "auth_update_service_order_media"  ON storage.objects;
CREATE POLICY "auth_update_service_order_media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'service-order-media');

DROP POLICY IF EXISTS "public_read_service_order_media"  ON storage.objects;
CREATE POLICY "public_read_service_order_media" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'service-order-media');

-- ─── 8. Função RPC: busca por telefone ──────────────
-- Usada pelo /api/consultar para comparar dígitos sem formatação.
-- Cria ou substitui com segurança.
DROP FUNCTION IF EXISTS public.search_requests_by_phone(text);
CREATE FUNCTION public.search_requests_by_phone(phone_digits text)
RETURNS SETOF public.service_requests
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT *
  FROM public.service_requests
  WHERE regexp_replace(customer_phone, '\D', '', 'g') LIKE '%' || phone_digits || '%'
  ORDER BY created_at DESC;
$$;
