import { NextResponse } from 'next/server'
import { createResolutooAuthServerClient } from '@/lib/supabase/resolutooAuthServer'

export async function GET() {
  const supabase = await createResolutooAuthServerClient()
  const { data, error } = await supabase.auth.getUser()
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL,
    hasUser: Boolean(data.user),
    userEmail: data.user?.email ?? null,
    error: error?.message ?? null,
  })
}
