import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VR Tech - Assistência Técnica Especializada",
  description: "Conserto de celulares com agilidade e garantia. Solicite seu orçamento e acompanhe a coleta e entrega no seu endereço.",
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
      <body className="min-h-full flex flex-col bg-vr-black">{children}</body>
    </html>
  );
}
