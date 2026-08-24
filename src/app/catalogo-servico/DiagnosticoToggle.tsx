'use client'

import { useState } from 'react'
import { Stethoscope, ChevronDown } from 'lucide-react'
import ServiceRequestForm from '@/components/ServiceRequestForm'

export default function DiagnosticoToggle({
  apenasRetirada,
  coletaGratis,
}: {
  apenasRetirada: boolean
  coletaGratis: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-vr-graphite border border-white/5 rounded-2xl overflow-hidden mb-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-6 text-left hover:bg-white/2 transition-colors"
      >
        <div className="w-12 h-12 rounded-xl bg-vr-red/10 text-vr-red flex items-center justify-center shrink-0">
          <Stethoscope className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold">
            Quebrou o aparelho e não sabe onde exatamente ele quebrou?
          </h2>
          <p className="text-vr-silver/60 text-sm mt-0.5">
            Solicite seu orçamento — faça um diagnóstico para saber qual o problema do aparelho danificado.
          </p>
        </div>
        <ChevronDown className={`w-5 h-5 text-vr-silver/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-6 pt-0">
          <div className="border-t border-white/5 pt-6">
            <ServiceRequestForm apenasRetirada={apenasRetirada} coletaGratis={coletaGratis} diagnosisOnly />
          </div>
        </div>
      )}
    </div>
  )
}
