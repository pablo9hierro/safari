import ServiceRequestForm from '@/components/ServiceRequestForm'
import { Smartphone, Wrench, Truck } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800">
      <header className="px-6 pt-10 pb-8 text-center text-white">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold">TechFix</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight mb-2">
          Conserto de celular<br />sem sair de casa
        </h1>
        <p className="text-blue-100 text-sm">
          Buscamos, consertamos e devolvemos no seu endereço
        </p>
      </header>

      <div className="flex justify-center gap-3 px-4 mb-6 flex-wrap">
        {[
          { icon: <Truck className="w-4 h-4" />, text: 'Coleta e entrega' },
          { icon: <Wrench className="w-4 h-4" />, text: 'Orçamento grátis' },
          { icon: <Smartphone className="w-4 h-4" />, text: 'Todas as marcas' },
        ].map((f) => (
          <div key={f.text} className="flex items-center gap-1.5 bg-white/15 rounded-xl px-3 py-2 text-white text-xs font-medium">
            {f.icon}
            {f.text}
          </div>
        ))}
      </div>

      <div className="mx-4 bg-white rounded-3xl shadow-2xl p-6 mb-8 max-w-lg md:mx-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Solicitar orçamento</h2>
        <p className="text-gray-500 text-sm mb-6">Preencha os dados abaixo e responderemos em até 2h</p>
        <ServiceRequestForm />
      </div>
    </main>
  )
}
