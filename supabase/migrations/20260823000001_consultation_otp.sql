-- OTP de acesso pro /consultar: codigo curto (3 digitos) enviado por
-- WhatsApp, prova posse do numero sem exigir login/senha. Mesmo padrao ja
-- usado na plataforma (sunset._create_customer_reset_code), recriado aqui
-- no schema vrtech porque e outro projeto Supabase.
CREATE TABLE IF NOT EXISTS vrtech.consultation_otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_digits TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultation_otps_phone ON vrtech.consultation_otps(phone_digits, created_at DESC);

GRANT ALL ON vrtech.consultation_otps TO anon, authenticated, service_role;
ALTER TABLE vrtech.consultation_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consultation_otps_all" ON vrtech.consultation_otps;
CREATE POLICY "consultation_otps_all" ON vrtech.consultation_otps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Gera um codigo novo pro telefone, invalidando (expirando) qualquer
-- codigo anterior ainda vivo -- nunca mais de um codigo valido por vez
-- pro mesmo numero, reduz a janela de forca bruta.
CREATE OR REPLACE FUNCTION vrtech.generate_consultation_otp(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vrtech
AS $$
DECLARE
  v_code TEXT;
  v_phone TEXT;
BEGIN
  v_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_phone) < 8 THEN
    RAISE EXCEPTION 'telefone invalido';
  END IF;

  UPDATE vrtech.consultation_otps
  SET expires_at = now()
  WHERE phone_digits = v_phone AND expires_at > now();

  v_code := lpad(floor(random() * 1000)::text, 3, '0');

  INSERT INTO vrtech.consultation_otps (phone_digits, code, expires_at)
  VALUES (v_phone, v_code, now() + interval '10 minutes');

  RETURN v_code;
END;
$$;

-- Valida o par telefone+codigo. Incrementa `attempts` em toda tentativa
-- (certa ou errada) do codigo mais recente daquele telefone -- depois de
-- max_attempts, bloqueia mesmo que um codigo correto seja tentado, ate um
-- codigo novo ser gerado.
CREATE OR REPLACE FUNCTION vrtech.verify_consultation_otp(p_phone TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vrtech
AS $$
DECLARE
  v_phone TEXT;
  v_row vrtech.consultation_otps%ROWTYPE;
BEGIN
  v_phone := regexp_replace(p_phone, '\D', '', 'g');

  SELECT * INTO v_row
  FROM vrtech.consultation_otps
  WHERE phone_digits = v_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_row.attempts >= v_row.max_attempts THEN
    RETURN false;
  END IF;

  UPDATE vrtech.consultation_otps SET attempts = attempts + 1 WHERE id = v_row.id;

  IF v_row.expires_at < now() THEN
    RETURN false;
  END IF;

  IF v_row.code != p_code THEN
    RETURN false;
  END IF;

  UPDATE vrtech.consultation_otps SET used_at = now() WHERE id = v_row.id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION vrtech.generate_consultation_otp(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vrtech.verify_consultation_otp(TEXT, TEXT) TO anon, authenticated, service_role;
