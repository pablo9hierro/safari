-- Validade do codigo de acesso do /consultar sobe de 10 pra 60 minutos --
-- pedido explicito: 10 min expirava rapido demais entre o cliente receber
-- o link/codigo no WhatsApp e realmente abrir pra acompanhar.
CREATE OR REPLACE FUNCTION vrtech.generate_consultation_otp(p_phone TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = vrtech AS $$
DECLARE v_code TEXT; v_phone TEXT;
BEGIN
  v_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_phone) < 8 THEN RAISE EXCEPTION 'telefone invalido'; END IF;
  UPDATE vrtech.consultation_otps SET expires_at = now()
  WHERE phone_digits = v_phone AND expires_at > now();
  v_code := lpad(floor(random() * 1000)::text, 3, '0');
  INSERT INTO vrtech.consultation_otps (phone_digits, code, expires_at)
  VALUES (v_phone, v_code, now() + interval '60 minutes');
  RETURN v_code;
END; $$;
