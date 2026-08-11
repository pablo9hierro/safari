import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Mesmo formato de redirect de volta pro frontend usado pelo Resolutoo
// (mercadopago_oauth.rs::frontend_redirect): "?status=success|error|cancelled"
// em vez do antigo "?mp=connected|error".
function redirectStatus(origin: string, status: 'success' | 'error' | 'cancelled', reason?: string) {
  const url = new URL('/dashboard/financeiro', origin)
  url.searchParams.set('status', status)
  if (reason) url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return redirectStatus(req.nextUrl.origin, 'cancelled', error)
  }

  if (!code || !state) {
    return redirectStatus(req.nextUrl.origin, 'error', 'missing_params')
  }

  const supabase = createServiceClient()

  const { data: stateRow } = await supabase
    .from('mercadopago_oauth_states')
    .select('code_verifier, created_at')
    .eq('state', state)
    .single()

  if (!stateRow) {
    return redirectStatus(req.nextUrl.origin, 'error', 'invalid_state')
  }

  // expire after 15 min
  const created = new Date(stateRow.created_at).getTime()
  if (Date.now() - created > 15 * 60 * 1000) {
    await supabase.from('mercadopago_oauth_states').delete().eq('state', state)
    return redirectStatus(req.nextUrl.origin, 'error', 'state_expired')
  }

  const redirectUri = process.env.MP_REDIRECT_URI
  const clientId = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  if (!redirectUri || !clientId || !clientSecret) {
    return redirectStatus(req.nextUrl.origin, 'error', 'not_configured')
  }

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: stateRow.code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('MP token exchange failed:', body)
    return redirectStatus(req.nextUrl.origin, 'error', 'token_exchange')
  }

  const token = await tokenRes.json()

  // connection_status (production/sandbox via live_mode): mesmo dado que o
  // Resolutoo guarda pro lojista, o vrtech não distinguia até agora.
  await supabase.from('mercadopago_config').upsert({
    id: 'default',
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    public_key: token.public_key ?? null,
    mp_user_id: String(token.user_id ?? ''),
    expires_at: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    connected_at: new Date().toISOString(),
    connection_status: token.live_mode === false ? 'sandbox' : 'production',
    status: 'connected',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  await supabase.from('mercadopago_oauth_states').delete().eq('state', state)

  return redirectStatus(req.nextUrl.origin, 'success')
}
