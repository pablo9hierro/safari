-- BUG CRÍTICO: o dashboard do lojista (/dashboard/**) nunca autentica contra
-- o projeto Supabase do vrtech — o login (/login) só cria sessão no projeto
-- Supabase da PLATAFORMA (Resolutoo), que é quem realmente gate-keepa o
-- acesso às rotas /dashboard (ver src/app/dashboard/layout.tsx, checa
-- getUser() do createResolutooAuthServerClient — nunca redireciona sem
-- sessão válida). Todo o resto do dashboard usa @/lib/supabase/client
-- (createBrowserClient) direto nas tabelas vrtech, que SEMPRE roda como
-- role `anon` nesse projeto (nunca `authenticated`, porque não existe login
-- nenhum contra esse projeto). Como as policies abaixo eram só `TO
-- authenticated`, TODA escrita client-side no dashboard sempre devolveu 401
-- — cadastrar item de estoque, produto, serviço, editar diagnóstico, salvar
-- OS, etc. Não é regressão de nenhuma mudança recente; existe desde a
-- migration fundacional (20260728000001).
--
-- Fix: as tabelas abaixo já eram `USING (true)` (sem filtro por linha) —
-- a intenção sempre foi "qualquer requisição que chegou aqui passou pelo
-- gate do /dashboard, então pode escrever". Só falta liberar pra `anon`
-- também, já que é o role real usado. Isso não abre nada que já não estava
-- de fato acessível: a chave publishable já é pública no bundle do browser
-- e várias dessas tabelas já tinham SELECT liberado pra anon sem
-- restrição. Risco real: alguém extrair a chave e escrever direto sem
-- passar pelo /login — mitigação de verdade fica pra depois (mover essas
-- escritas pra rotas /api/* com service role, como já é feito em
-- /api/assistant/ai-models e Template Zap).

DROP POLICY IF EXISTS "auth_update_service_requests" ON vrtech.service_requests;
CREATE POLICY "auth_update_service_requests" ON vrtech.service_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "diag_auth_all" ON vrtech.service_diagnostics;
CREATE POLICY "diag_auth_all" ON vrtech.service_diagnostics FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_whatsapp_state" ON vrtech.whatsapp_state;
CREATE POLICY "auth_all_whatsapp_state" ON vrtech.whatsapp_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_service_orders" ON vrtech.service_orders;
CREATE POLICY "auth_all_service_orders" ON vrtech.service_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_service_order_updates" ON vrtech.service_order_updates;
CREATE POLICY "auth_all_service_order_updates" ON vrtech.service_order_updates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_stock_items" ON vrtech.stock_items;
CREATE POLICY "auth_all_stock_items" ON vrtech.stock_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_stock_movements" ON vrtech.stock_movements;
CREATE POLICY "auth_all_stock_movements" ON vrtech.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_shipping_rates" ON vrtech.neighborhood_shipping_rates;
CREATE POLICY "auth_all_shipping_rates" ON vrtech.neighborhood_shipping_rates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_product_categories" ON vrtech.product_categories;
CREATE POLICY "auth_all_product_categories" ON vrtech.product_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_products" ON vrtech.products;
CREATE POLICY "auth_all_products" ON vrtech.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_store_orders" ON vrtech.store_orders;
CREATE POLICY "auth_all_store_orders" ON vrtech.store_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_store_order_items" ON vrtech.store_order_items;
CREATE POLICY "auth_all_store_order_items" ON vrtech.store_order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_shipping_settings" ON vrtech.shipping_settings;
CREATE POLICY "auth_all_shipping_settings" ON vrtech.shipping_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "catalog_cat_all" ON vrtech.service_catalog_categories;
CREATE POLICY "catalog_cat_all" ON vrtech.service_catalog_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "catalog_items_all" ON vrtech.service_catalog_items;
CREATE POLICY "catalog_items_all" ON vrtech.service_catalog_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "catalog_parts_all" ON vrtech.service_catalog_item_parts;
CREATE POLICY "catalog_parts_all" ON vrtech.service_catalog_item_parts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vrtech_auth_upload_media" ON storage.objects;
CREATE POLICY "vrtech_auth_upload_media" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'vrtech-service-order-media');

DROP POLICY IF EXISTS "vrtech_auth_update_media" ON storage.objects;
CREATE POLICY "vrtech_auth_update_media" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'vrtech-service-order-media');
