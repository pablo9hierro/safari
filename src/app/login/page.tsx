'use client'

import { useState } from 'react'
import { createResolutooAuthClient } from '@/lib/supabase/resolutooAuthClient'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import Logo from '@/components/ui/Logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createResolutooAuthClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('E-mail ou senha incorretos')
      setLoading(false)
      return
    }

    // Login "sombra" no ecommerce-api (mesma senha, mesmo admin que o
    // onboarding provisionou) — pega o JWT de AdminUser, necessário pra
    // ler Pedidos/Financeiro reais (endpoints admin do motor, autenticação
    // separada da sessão Supabase acima). Best-effort: se falhar, a tela de
    // Pedidos mostra o erro real, não trava o login em si.
    try {
      const ecommerceApiUrl = process.env.NEXT_PUBLIC_ECOMMERCE_API_URL ?? 'https://ecommerce-api-production-d447.up.railway.app'
      const tenantSlug = process.env.NEXT_PUBLIC_ECOMMERCE_TENANT_SLUG ?? 'vrtech'
      const res = await fetch(`${ecommerceApiUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
      })
      if (res.ok) {
        const { token } = await res.json()
        localStorage.setItem('vrtech_admin_token', token)
      }
    } catch {
      /* best-effort — não bloqueia o login principal */
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-vr-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" light className="items-center mb-2" />
          <p className="text-gray-500 text-sm mt-1">Acesso do administrador</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@vrtech.com"
              required
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input-field"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
