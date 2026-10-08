import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nutrequine Pro | Administración",
  description: "Producción, ventas, cobranza e inventario de Nutrequine Pro.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/brand/logo.jpg",
    shortcut: "/brand/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
