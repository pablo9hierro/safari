import { fetchServiceCatalog, type CatalogCategory, type CatalogItem } from '@/lib/resolutoo/catalog'
import { fetchPlatformStoreConfig } from '@/lib/resolutoo/platformConfig'
import CatalogoClient from './CatalogoClient'
import DiagnosticoToggle from './DiagnosticoToggle'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { CartProvider } from '@/lib/carrinho/context'
import CarrinhoFlutuante from '@/components/CarrinhoFlutuante'
import { StoreLink } from '@/lib/storeProxyLink'

// `force-dynamic` desativava até o cache da própria chamada fetch()
// (equivalente a no-store em tudo), fazendo toda visita esperar um
// round-trip novo pro ecommerce-api sem timeout -- página demorava
// minutos pra abrir quando aquele serviço externo degradava. As chamadas
// em fetchServiceCatalog() já têm revalidate + timeout próprios agora
// (ver catalog.ts); sem forçar dynamic aqui, o Next reaproveita esse
// cache entre visitas em vez de sempre esperar a rede.
export const revalidate = 30

export type { CatalogCategory, CatalogItem }

export default async function CatalogoServicoPage() {
  const [{ categories, items }, { apenas_retirada: apenasRetirada, coleta_gratis: coletaGratis }] = await Promise.all([
    fetchServiceCatalog(),
    fetchPlatformStoreConfig(),
  ])

  return (
    <CartProvider>
    <main className="min-h-screen bg-vr-black text-white">
      <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto border-b border-white/5">
        <StoreLink href="/">
          <Image
            src="https://res.cloudinary.com/dkqhped8y/image/upload/v1783212643/iconelogo_rpcnvw.png"
            alt="VR Tech"
            width={56}
            height={56}
            className="rounded-lg block"
            unoptimized
          />
        </StoreLink>
        <StoreLink href="/" className="flex items-center gap-1.5 text-sm font-medium text-vr-silver hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </StoreLink>
      </header>

      <section className="px-5 sm:px-10 py-10 max-w-5xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-black mb-2">
          Serviços e <span className="text-vr-red">orçamento</span>
        </h1>
        <p className="text-vr-silver/60 mb-8 text-sm max-w-lg">
          Consulte os valores por modelo de celular e tipo de reparo. Preços sujeitos a alteração — confirme no orçamento.
        </p>

        <DiagnosticoToggle apenasRetirada={apenasRetirada} coletaGratis={coletaGratis} />

        <CatalogoClient
          categories={(categories ?? []) as CatalogCategory[]}
          items={(items ?? []) as CatalogItem[]}
        />
      </section>
      <CarrinhoFlutuante />
    </main>
    </CartProvider>
  )
}
