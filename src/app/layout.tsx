import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechFix - Assistência Técnica de Celulares",
  description: "Solicite o orçamento para o reparo do seu celular. Buscamos e entregamos no seu endereço.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
