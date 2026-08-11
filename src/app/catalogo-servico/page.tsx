import { fetchServiceCatalog, type CatalogCategory, type CatalogItem } from '@/lib/resolutoo/catalog'
import CatalogoClient from './CatalogoClient'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'

export const dynamic = 'force-dynamic'

export type { CatalogCategory, CatalogItem }

export default async function CatalogoServicoPage() {
  const { categories, items } = await fetchServiceCatalog()

  return (
    <CartProvider>
    <main className="min-h-screen bg-vr-black text-white">
      <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto border-b border-white/5">
        <Link href="/">
          <Image
            src="https://res.cloudinary.com/dkqhped8y/image/upload/v1783212643/iconelogo_rpcnvw.png"
            alt="VR Tech"
            width={56}
            height={56}
            className="rounded-lg block"
            unoptimized
          />
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
      </header>

      <section className="px-5 sm:px-10 py-10 max-w-5xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-black mb-2">
          Catálogo de <span className="text-vr-red">serviços</span>
        </h1>
        <p className="text-vr-silver/60 mb-8 text-sm max-w-lg">
          Consulte os valores por modelo de celular e tipo de reparo. Preços sujeitos a alteração — confirme no orçamento.
        </p>

        <CatalogoClient
          categories={(categories ?? []) as CatalogCategory[]}
          items={(items ?? []) as CatalogItem[]}
        />

        <div className="mt-12 bg-vr-graphite border border-white/5 rounded-2xl p-6 text-center space-y-3">
          <p className="text-vr-silver/60 text-sm">Não encontrou seu modelo ou serviço?</p>
          <a
            href="/#orcamento"
            className="inline-flex items-center gap-2 bg-vr-red text-white font-semibold px-6 py-3 rounded-xl hover:bg-vr-red/90 transition-colors text-sm"
          >
            Solicitar orçamento grátis
          </a>
        </div>
      </section>
      <CarrinhoFlutuante />
    </main>
    </CartProvider>
  )
}
