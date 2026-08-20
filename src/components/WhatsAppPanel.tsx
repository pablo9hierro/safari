'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wifi, WifiOff, RefreshCw, Smartphone, LogOut } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'

type WState = {
  status: 'connected' | 'connecting' | 'disconnected'
  qr_code: string | null
  updated_at: string
}

const AUTO_CONNECT_COOLDOWN_MS = 60000

export default function WhatsAppPanel() {
  const [state, setState] = useState<WState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectDebug, setConnectDebug] = useState<string | null>(null)
  const lastConnectAttempt = useRef(0)

  // Pede pra Evolution API gerar/renovar o QR sozinha — sem precisar abrir o Manager.
  const autoConnect = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastConnectAttempt.current < AUTO_CONNECT_COOLDOWN_MS) return
    lastConnectAttempt.current = now
    try {
      const res = await fetch(apiPath('/api/whatsapp/connect'), { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setConnectError(data?.error || `Erro ${res.status} ao conectar`)
        setConnectDebug(null)
      } else {
        setConnectError(null)
        setConnectDebug(JSON.stringify(data?.data ?? data).slice(0, 500))
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Erro ao conectar WhatsApp')
      setConnectDebug(null)
    }
  }, [])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('whatsapp_state')
      .select('status, qr_code, updated_at')
      .eq('id', 1)
      .single()
    if (data) setState(data as WState)

    const current = data as WState | null
    const hasUsableQr = !!current?.qr_code
    // Tenta conectar sempre que não estiver conectado e não houver QR pra mostrar
    // (cobre tanto "disconnected" quanto "connecting" travado sem QR).
    if (current?.status !== 'connected' && !hasUsableQr) autoConnect()
  }, [autoConnect])

  const manualRefresh = async () => {
    setRefreshing(true)
    if ((state?.status ?? 'disconnected') !== 'connected') await autoConnect(true)
    await load()
    setRefreshing(false)
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setConnectError(null)
    await autoConnect(true)
    await load()
    setDisconnecting(false)
  }

  useEffect(() => {
    load()

    // Poll every 5s as fallback (realtime can miss events)
    const interval = setInterval(load, 5000)

    const supabase = createClient()
    const ch = supabase
      .channel('wwa_panel')
      .on('postgres_changes', { event: '*', schema: 'vrtech', table: 'whatsapp_state' }, load)
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(ch)
    }
  }, [load])

  const status = state?.status ?? 'disconnected'

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-green-500" />
          </div>
          <span className="font-semibold text-white text-sm">WhatsApp</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={manualRefresh}
            disabled={refreshing}
            className="text-xs text-vr-silver/50 hover:text-vr-silver transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <div className="flex items-center gap-1.5">
            {status === 'connected' && (
              <><Wifi className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 font-semibold">Conectado</span></>
            )}
            {status === 'connecting' && (
              <><RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" /><span className="text-xs text-yellow-500 font-semibold">Aguardando scan</span></>
            )}
            {status === 'disconnected' && (
              <><WifiOff className="w-4 h-4 text-vr-red-light" /><span className="text-xs text-vr-red-light font-semibold">Desconectado</span></>
            )}
          </div>
        </div>
      </div>

      {status !== 'connected' && state?.qr_code && (
        <div className="text-center mt-2">
          <p className="text-xs text-vr-silver/60 mb-2">Escaneie com o WhatsApp do seu celular:</p>
          <img
            src={state.qr_code}
            alt="QR Code WhatsApp"
            className="w-44 h-44 mx-auto rounded-xl border border-white/10"
          />
          <p className="text-xs text-vr-silver/40 mt-1">O QR expira em 20s — atualiza sozinho</p>
        </div>
      )}

      {status !== 'connected' && !state?.qr_code && !connectError && (
        <p className="text-xs text-vr-silver/40 mt-1">
          Conectando à Evolution API automaticamente... o QR aparece aqui em poucos segundos.
        </p>
      )}

      {connectError && (
        <p className="text-xs text-vr-red-light mt-1 break-all">
          Erro ao conectar: {connectError}
        </p>
      )}

      {status !== 'connected' && !state?.qr_code && connectDebug && (
        <p className="text-[10px] text-vr-silver/30 mt-2 break-all font-mono">
          Resposta da Evolution API (debug): {connectDebug}
        </p>
      )}

      {status === 'connected' && (
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-green-500">✓ Notificações automáticas ativas</p>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1 text-xs text-vr-silver/40 hover:text-vr-red-light transition-colors"
          >
            <LogOut className="w-3 h-3" />
            {disconnecting ? 'Desconectando...' : 'Desconectar'}
          </button>
        </div>
      )}
    </div>
  )
}
