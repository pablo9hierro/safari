-- Mesma classe de bug já documentada em 20260816000001_fix_dashboard_rls_anon.sql:
-- o dashboard nunca autentica contra o projeto Supabase do vrtech, então
-- toda escrita client-side roda como role `anon`, nunca `authenticated`.
-- A migration 20260821000006 criou device_types/catalog_models/
-- service_item_devices/service_item_brands/service_item_models com policy
-- de escrita `auth.role() = 'authenticated'` -- ou seja, cadastrar/editar
-- aparelho, marca, modelo, e vincular serviço a eles sempre devolveu 401
-- em produção desde que essas tabelas existem.

DROP POLICY IF EXISTS "device_types_auth_all" ON vrtech.device_types;
CREATE POLICY "device_types_auth_all" ON vrtech.device_types FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "catalog_models_auth_all" ON vrtech.catalog_models;
CREATE POLICY "catalog_models_auth_all" ON vrtech.catalog_models FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sid_auth_all" ON vrtech.service_item_devices;
CREATE POLICY "sid_auth_all" ON vrtech.service_item_devices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sib_auth_all" ON vrtech.service_item_brands;
CREATE POLICY "sib_auth_all" ON vrtech.service_item_brands FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sim_auth_all" ON vrtech.service_item_models;
CREATE POLICY "sim_auth_all" ON vrtech.service_item_models FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
