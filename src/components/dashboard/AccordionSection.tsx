'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Seção expansível — mesmo padrão visual/estrutural já usado em
 * AssistenteClient.tsx (Prompt da 1ª/2ª camada), só generalizado pra
 * aceitar qualquer conteúdo em vez de um textarea fixo.
 */
export default function AccordionSection({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-vr-graphite rounded-2xl border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-white">{title}</span>
          {subtitle && <span className="block text-xs text-vr-silver/50 mt-0.5">{subtitle}</span>}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-vr-silver/40 shrink-0" /> : <ChevronDown className="w-4 h-4 text-vr-silver/40 shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}
