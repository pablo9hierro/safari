-- search_requests_by_phone comparava "telefone salvo CONTÉM os dígitos
-- buscados" -- funciona quando o cliente digita menos dígitos que o
-- salvo, mas quebra no caso comum de link/OTP mandando o telefone com
-- código do país (55...) enquanto o banco guardou sem: os dígitos
-- buscados (mais longos) nunca aparecem dentro do valor salvo (mais
-- curto), RPC sempre retorna vazio. Comparar pelos últimos 8 dígitos
-- (mesma heurística já usada no fallback client-side) resolve nos dois
-- sentidos, com ou sem "55"/"0" na frente.
CREATE OR REPLACE FUNCTION vrtech.search_requests_by_phone(phone_digits text)
RETURNS SETOF vrtech.service_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = vrtech AS $$
  SELECT * FROM vrtech.service_requests
  WHERE regexp_replace(customer_phone, '\D', '', 'g') LIKE '%' || right(phone_digits, 8) || '%'
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION vrtech.search_requests_by_phone(text) TO anon, authenticated;
