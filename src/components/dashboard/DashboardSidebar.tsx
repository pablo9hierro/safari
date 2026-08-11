'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/ui/Logo'
import { ClipboardList, Truck, Package, ShoppingBag, Wallet, LogOut, UserCog, Bot } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Solicitações', icon: ClipboardList },
  { href: '/dashboard/produtos', label: 'Produtos/Serviços', icon: Package },
  { href: '/dashboard/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/dashboard/frete', label: 'Frete', icon: Truck },
  { href: '/dashboard/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/dashboard/assistente-ia', label: 'Assistente IA', icon: Bot },
  { href: '/dashboard/conta', label: 'Conta', icon: UserCog },
]

export default function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 bg-vr-graphite border-r border-white/5 min-h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-white/5">
          <Logo size="sm" />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                  ${active ? 'bg-vr-red text-white' : 'text-vr-silver/70 hover:bg-vr-graphite-light hover:text-white'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 py-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-vr-silver/70 hover:text-vr-red transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Top bar + nav — mobile */}
      <header className="md:hidden bg-vr-graphite border-b border-white/5 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <Logo size="sm" />
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-vr-silver/70 hover:text-vr-red text-sm transition-colors">
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>
      <nav className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 bg-vr-black border-b border-white/5 scrollbar-hide sticky top-16.25 z-10">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${active ? 'bg-vr-red text-white' : 'bg-vr-graphite border border-white/5 text-vr-silver hover:bg-vr-graphite-light'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
