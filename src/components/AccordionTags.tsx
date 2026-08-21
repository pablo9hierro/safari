'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Mostra as tags de busca do produto/serviço num disclosure real (recolhido
 * por padrão, expande com clique de verdade) -- NUNCA display:none nem
 * offscreen. Conteúdo escondido via CSS pra enganar buscador é o que a
 * política de conteúdo enganoso do Google pune (shadow ban de alcance);
 * um accordion clicável é o mesmo padrão usado em FAQs de qualquer site e é
 * plenamente indexável/aceito -- a diferença entre os dois é exatamente
 * essa: interação real do usuário disponível, não é cosmético.
 */
export default function AccordionTags({ tags, dark }: { tags?: string[] | null; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!tags || tags.length === 0) return null

  const borderCls = dark ? 'border-white/5' : 'border-gray-100'
  const buttonCls = dark ? 'text-vr-silver/40 hover:text-vr-silver/70' : 'text-gray-400 hover:text-gray-600'
  const tagCls = dark ? 'text-vr-silver/60 bg-white/5' : 'text-gray-500 bg-gray-50'

  return (
    <div className={`border-t ${borderCls} mt-1 pt-1`} onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className={`w-full flex items-center justify-between text-[10px] py-1 transition-colors ${buttonCls}`}
      >
        <span>Detalhes</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 pb-1.5">
          {tags.map((tag) => (
            <span key={tag} className={`text-[10px] rounded-full px-2 py-0.5 ${tagCls}`}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
