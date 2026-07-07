'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import WhatsAppPanel from '@/components/WhatsAppPanel'
import { KeyRound, Check } from 'lucide-react'

function PasswordSection() {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword.length < 6) { setError('Mínimo 6 caracteres'); return }
    if (newPassword !== confirm) { setError('As senhas não coincidem'); return }
    setLoading(true)
    const { error: err } = await createClient().auth.updateUser({ password: newPassword })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setNewPassword('')
    setConfirm('')
  }

  return (
    <div className="bg-vr-graphite border border-white/5 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-vr-red/10 rounded-xl flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-vr-red" />
        </div>
        <h2 className="font-semibold text-white text-sm">Alterar senha</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-vr-silver/60 block mb-1">Nova senha</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-vr-red"
            placeholder="Mínimo 6 caracteres"
            required
          />
        </div>
        <div>
          <label className="text-xs text-vr-silver/60 block mb-1">Confirmar senha</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-vr-red"
            placeholder="Repita a senha"
            required
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        {success && (
          <p className="text-green-400 text-xs flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Senha alterada com sucesso
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-vr-red hover:bg-vr-red-light text-white font-semibold py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar senha'}
        </button>
      </form>
    </div>
  )
}

export default function ContaPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <h1 className="text-lg font-bold text-white">Conta</h1>
      <WhatsAppPanel />
      <PasswordSection />
    </div>
  )
}
