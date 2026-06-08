'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wifi, WifiOff, RefreshCw, Smartphone } from 'lucide-react'

type WState = {
  status: 'connected' | 'connecting' | 'disconnected'
  qr_code: string | null
  updated_at: string
}

export default function WhatsAppPanel() {
  const [state, setState] = useState<WState | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('whatsapp_state')
      .select('status, qr_code, updated_at')
      .eq('id', 1)
      .single()
    if (data) setState(data as WState)
  }, [])

  const manualRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  useEffect(() => {
    load()

    // Poll every 5s as fallback (realtime can miss events)
    const interval = setInterval(load, 5000)

    const supabase = createClient()
    const ch = supabase
      .channel('wwa_panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_state' }, load)
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(ch)
    }
  }, [load])

  const status = state?.status ?? 'disconnected'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-100 rounded-xl flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-green-600" />
          </div>
          <span className="font-semibold text-gray-800 text-sm">WhatsApp</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={manualRefresh}
            disabled={refreshing}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <div className="flex items-center gap-1.5">
            {status === 'connected' && (
              <><Wifi className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600 font-semibold">Conectado</span></>
            )}
            {status === 'connecting' && (
              <><RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" /><span className="text-xs text-yellow-600 font-semibold">Aguardando scan</span></>
            )}
            {status === 'disconnected' && (
              <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-xs text-red-500 font-semibold">Desconectado</span></>
            )}
          </div>
        </div>
      </div>

      {status !== 'connected' && state?.qr_code && (
        <div className="text-center mt-2">
          <p className="text-xs text-gray-500 mb-2">Escaneie com o WhatsApp do seu celular:</p>
          <img
            src={state.qr_code}
            alt="QR Code WhatsApp"
            className="w-44 h-44 mx-auto rounded-xl border border-gray-100"
          />
          <p className="text-xs text-gray-400 mt-1">O QR expira em 20s — atualiza sozinho</p>
        </div>
      )}

      {status === 'disconnected' && !state?.qr_code && (
        <p className="text-xs text-gray-400 mt-1">
          {state
            ? 'Serviço desconectado. Reinicie o whatsapp-service no Railway.'
            : 'Aguardando o whatsapp-service iniciar no Railway...'}
        </p>
      )}

      {status === 'connected' && (
        <p className="text-xs text-green-600 mt-1">✓ Notificações automáticas ativas</p>
      )}
    </div>
  )
}
