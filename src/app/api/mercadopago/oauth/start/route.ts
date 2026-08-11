import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const CLIENT_ID = process.env.MP_CLIENT_ID ?? '308128130647506'
const REDIRECT_URI = process.env.MP_REDIRECT_URI ?? 'https://vrtech-jp.vercel.app/api/mercadopago/oauth/callback'

// PKCE: verifier = 64-char random alphanum, challenge = base64url(SHA-256(verifier))
function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url').slice(0, 64)
  const digest = crypto.createHash('sha256').update(verifier).digest()
  const challenge = digest.toString('base64url')
  return { verifier, challenge }
}

export async function POST() {
  const supabase = createServiceClient()
  const state = crypto.randomUUID()
  const { verifier, challenge } = generatePkce()

  // Clean old states (> 15 min)
  await supabase
    .from('mercadopago_oauth_states')
    .delete()
    .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())

  await supabase.from('mercadopago_oauth_states').insert({ state, code_verifier: verifier })

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const authorize_url = `https://auth.mercadopago.com.br/authorization?${params}`
  return NextResponse.json({ authorize_url })
}
