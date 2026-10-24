import type { Metadata } from "next";
import "./globals.css";
import { Navigation, SiteFooter } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Biblioteca | Encuentra tu próxima lectura",
  description: "Explora el catálogo, solicita préstamos y sigue tu lectura.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <Navigation />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
