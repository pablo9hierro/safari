import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // resolutoo.com (projeto "ufersin") faz proxy reverso (Vercel rewrite,
  // não redirect) pra este app em /loja/eletronica-admin e
  // /loja/eletronica-loja — o browser acha que está em resolutoo.com,
  // então qualquer asset com caminho relativo (_next/static/...) tentava
  // carregar de LÁ (onde não existe -> página crua sem CSS/JS). assetPrefix
  // força todo asset a sempre resolver pro domínio real deste deploy,
  // independente de quem tá proxiando — é o padrão oficial da Vercel pra
  // "multi-zones" (várias apps atrás de um domínio só via rewrite).
  assetPrefix: 'https://vrtech-jp.vercel.app',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
