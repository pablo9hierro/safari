'use client'

import { useEffect, useState } from 'react'
import { CreditCard, RefreshCw, Unlink, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { createResolutooAuthClient } from '@/lib/supabase/resolutooAuthClient'
import { envOr } from '@/lib/envGuard'

// Mesmo fluxo OAuth que qualquer lojista do Resolutoo usa (ufersin-api) —
// grava em tenants.plataforma_credenciais, não mais numa tabela própria do
// vrtech. Autenticação: mesmo JWT da sessão de login único (REQ-009).
const RESOLUTOO_API_URL = envOr(process.env.NEXT_PUBLIC_RESOLUTOO_API_URL, 'https://ufersin-api-production.up.railway.app')

type MeStatus = {
  has_plataforma_credenciais: boolean
  plataforma_pagamento: string | null
  plataforma_credenciais_mask?: string | null
}

async function authFetch(path: string, init?: RequestInit) {
  const supabase = createResolutooAuthClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada — faça login de novo.')
  return fetch(`${RESOLUTOO_API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` },
  })
}

export default function MercadoPagoSection() {
  const [mp, setMp] = useState<MeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/me')
      if (!res.ok) throw new Error()
      setMp(await res.json())
    } catch { setError('Não foi possível carregar o status do Mercado Pago') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleConnect = async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/mercadopago/oauth/start', { method: 'POST' })
      const { authorize_url } = await res.json()
      if (authorize_url) window.location.href = authorize_url
      else throw new Error('URL de autorização não retornada')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar conexão')
    } finally { setActionLoading(false) }
  }

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o Mercado Pago? Pagamentos via PIX vão parar de funcionar.')) return
    setActionLoading(true)
    try {
      await authFetch('/api/mercadopago/oauth/disconnect', { method: 'POST' })
      await fetchStatus()
    } catch { setError('Erro ao desconectar') }
    finally { setActionLoading(false) }
  }

  const connected = Boolean(mp?.has_plataforma_credenciais && mp?.plataforma_pagamento === 'mercado_pago')

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-vr-red shrink-0" />
        <h2 className="text-sm font-bold text-white">Mercado Pago</h2>
        {!loading && (
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            connected
              ? 'bg-green-500/15 text-green-400'
              : 'bg-white/8 text-vr-silver/50'
          }`}>
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        )}
      </div>

      <p className="text-xs text-vr-silver/50">
        Conecte sua conta do Mercado Pago para aceitar pagamentos via PIX nas vendas da vitrine.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-vr-silver/40 text-xs py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando status...
        </div>
      ) : (
        <>
          {connected && mp?.plataforma_credenciais_mask && (
            <div className="flex items-center gap-2 text-xs text-green-400/80 bg-green-500/8 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Conta conectada · {mp.plataforma_credenciais_mask}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/8 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!connected ? (
              <button
                onClick={handleConnect}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-vr-red text-white text-xs font-semibold hover:bg-vr-red/80 transition-colors disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                Conectar conta
              </button>
            ) : (
              <>
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-vr-graphite border border-white/10 text-white text-xs font-semibold hover:border-vr-red/30 transition-colors disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Reconectar
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-vr-graphite border border-white/10 text-vr-silver/60 text-xs font-semibold hover:border-red-500/30 hover:text-red-400 transition-colors disabled:opacity-60"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Desconectar
                </button>
              </>
            )}
          </div>

          {!connected && (
            <p className="text-[10px] text-vr-silver/35 leading-relaxed">
              Ao clicar em &quot;Conectar conta&quot; você será redirecionado para o Mercado Pago para autorizar o acesso.
              Após autorizar, você será trazido de volta aqui automaticamente.
            </p>
          )}
        </>
      )}
    </div>
  )
}
