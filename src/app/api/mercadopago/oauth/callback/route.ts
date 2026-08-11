import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/dashboard/financeiro?mp=error&reason=' + encodeURIComponent(error), req.nextUrl.origin))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/financeiro?mp=error&reason=missing_params', req.nextUrl.origin))
  }

  const supabase = createServiceClient()

  const { data: stateRow } = await supabase
    .from('mercadopago_oauth_states')
    .select('code_verifier, created_at')
    .eq('state', state)
    .single()

  if (!stateRow) {
    return NextResponse.redirect(new URL('/dashboard/financeiro?mp=error&reason=invalid_state', req.nextUrl.origin))
  }

  // expire after 15 min
  const created = new Date(stateRow.created_at).getTime()
  if (Date.now() - created > 15 * 60 * 1000) {
    await supabase.from('mercadopago_oauth_states').delete().eq('state', state)
    return NextResponse.redirect(new URL('/dashboard/financeiro?mp=error&reason=state_expired', req.nextUrl.origin))
  }

  const redirectUri = process.env.MP_REDIRECT_URI ?? 'https://vrtech-jp.vercel.app/api/mercadopago/oauth/callback'
  const clientId = process.env.MP_CLIENT_ID ?? '308128130647506'
  const clientSecret = process.env.MP_CLIENT_SECRET ?? ''

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
    return NextResponse.redirect(new URL('/dashboard/financeiro?mp=error&reason=token_exchange', req.nextUrl.origin))
  }

  const token = await tokenRes.json()

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
    status: 'connected',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  await supabase.from('mercadopago_oauth_states').delete().eq('state', state)

  return NextResponse.redirect(new URL('/dashboard/financeiro?mp=connected', req.nextUrl.origin))
}
