import ServiceRequestForm from '@/components/ServiceRequestForm'
import Logo from '@/components/ui/Logo'
import {
  Smartphone,
  BatteryCharging,
  Plug,
  Wrench,
  ShieldCheck,
  Zap,
  Award,
  CheckCircle2,
  Search,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'

const SERVICES = [
  { icon: Smartphone, title: 'Troca de tela', desc: 'Telas originais com garantia para todas as marcas.' },
  { icon: BatteryCharging, title: 'Troca de bateria', desc: 'Recupere a autonomia do seu aparelho.' },
  { icon: Plug, title: 'Conector de carga', desc: 'Resolva carregamento lento ou intermitente.' },
  { icon: Wrench, title: 'Manutenção geral', desc: 'Diagnóstico completo e reparo especializado.' },
]

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: 'Garantia nos serviços' },
  { icon: Zap, label: 'Atendimento ágil' },
  { icon: Award, label: 'Equipe especializada' },
  { icon: CheckCircle2, label: 'Acabamento confiável' },
]

export default function Home() {
  return (
    <CartProvider>
      <main className="min-h-screen bg-vr-black text-white">
        {/* Header */}
        <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto">
          <Link href="/">
            <Image
              src="https://res.cloudinary.com/dkqhped8y/image/upload/v1783212643/iconelogo_rpcnvw.png"
              alt="VR Tech"
              width={80}
              height={80}
              className="rounded-lg block"
              unoptimized
            />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/loja"
              className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Catálogo</span>
            </Link>
            <Link
              href="/consultar"
              className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Acompanhar pedido</span>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="px-5 sm:px-10 pt-8 pb-16 max-w-6xl mx-auto text-center">
          <span className="inline-block text-vr-red text-xs font-bold tracking-[0.3em] uppercase mb-4">
            Assistência técnica premium
          </span>
          <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-4">
            Conserto de celular
            <br />
            com <span className="text-vr-red">rapidez</span>, <span className="text-vr-red">qualidade</span> e{' '}
            <span className="text-vr-red">garantia</span>
          </h1>
          <p className="text-vr-silver/70 max-w-xl mx-auto mb-8">
            Buscamos, consertamos e devolvemos seu aparelho no seu endereço. Peça um orçamento gratuito agora mesmo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#orcamento" className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2">
              Solicitar orçamento <ArrowRight className="w-4 h-4" />
            </a>
            <Link href="/loja" className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Ver catálogo
            </Link>
            <Link href="/consultar" className="btn-secondary w-full sm:w-auto text-center">
              Acompanhar solicitação
            </Link>
          </div>
        </section>

        {/* Serviços */}
        <section className="px-5 sm:px-10 py-12 bg-vr-graphite/40 border-y border-white/5">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-2xl sm:text-3xl font-bold mb-2">Nossos serviços</h2>
            <p className="text-center text-vr-silver/60 mb-10 text-sm">
              Foco total em assistência técnica de celulares
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {SERVICES.map((s) => (
                <div
                  key={s.title}
                  className="bg-vr-graphite border border-white/5 rounded-2xl p-5 hover:border-vr-red/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-vr-red/10 text-vr-red flex items-center justify-center mb-3">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold mb-1">{s.title}</h3>
                  <p className="text-vr-silver/60 text-sm">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Diferenciais */}
        <section className="px-5 sm:px-10 py-12 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.label} className="flex flex-col items-center text-center gap-2 p-4">
                <div className="w-12 h-12 rounded-full bg-vr-red/10 text-vr-red flex items-center justify-center">
                  <h.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-vr-silver">{h.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Formulário de orçamento */}
        <section id="orcamento" className="px-5 sm:px-10 py-16 bg-linear-to-b from-vr-graphite/40 to-vr-black">
          <div className="max-w-lg mx-auto bg-vr-graphite border border-white/8 rounded-3xl shadow-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-1">Solicitar orçamento</h2>
            <p className="text-vr-silver/50 text-sm mb-6">Preencha os dados abaixo e responderemos em até 2h</p>
            <ServiceRequestForm />
          </div>
        </section>

        {/* Footer */}
        <footer className="px-5 sm:px-10 py-10 border-t border-white/5">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
            <Logo size="md" showTagline />
            <div className="flex flex-wrap items-center justify-center gap-4">
              {SERVICES.map((s) => (
                <span key={s.title} className="flex items-center gap-1.5 text-xs text-vr-silver/60">
                  <s.icon className="w-3.5 h-3.5 text-vr-red" />
                  {s.title}
                </span>
              ))}
            </div>
            <p className="text-vr-silver/40 text-xs">
              © {new Date().getFullYear()} VR Tech. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </main>
      <CarrinhoFlutuante />
    </CartProvider>
  )
}
