'use client'

import WhatsAppPanel from '@/components/WhatsAppPanel'
import { AdminToStoreLink } from '@/lib/storeProxyLink'
import { KeyRound } from 'lucide-react'

/**
 * Login do painel e da conta assinante em /meu-plano são o MESMO cadastro
 * (mesmo Supabase Auth da plataforma -- ver createResolutooAuthClient em
 * DashboardSidebar). Achado real: esta página tinha um "Alterar senha"
 * próprio chamando @/lib/supabase/client (auth LOCAL do vrtech, projeto
 * diferente) -- atualizava uma conta que não tem nenhuma relação com o
 * login de verdade, então nunca fazia efeito nenhum no acesso real. Removido
 * de vez; troca de senha vive só em /meu-plano, fonte única da conta.
 */
function PasswordLinkOut() {
  return (
    <div className="bg-vr-graphite border border-white/5 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 bg-vr-red/10 rounded-xl flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-vr-red" />
        </div>
        <h2 className="font-semibold text-white text-sm">Senha da conta</h2>
      </div>
      <p className="text-xs text-vr-silver/60 mb-3">
        O login do painel é o mesmo da sua conta Resolutoo -- troque a senha por lá.
      </p>
      <AdminToStoreLink
        href="/trocar-senha"
        className="inline-flex items-center justify-center w-full bg-vr-black border border-white/10 hover:border-vr-red/40 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
      >
        Trocar senha em /meu-plano
      </AdminToStoreLink>
    </div>
  )
}

export default function ContaPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <h1 className="text-lg font-bold text-white">Conta</h1>
      <WhatsAppPanel />
      <PasswordLinkOut />
    </div>
  )
}
