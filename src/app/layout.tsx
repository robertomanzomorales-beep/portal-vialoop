import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";
import PortalLayout from "@/components/PortalLayout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Portal Vialoop",
    template: "%s | Portal Vialoop",
  },
  description:
    "Portal administrativo para la gestión de clientes, proyectos, solicitudes, renovaciones, pagos y suscripciones de Vialoop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="es"
    >
      <body>
        <PortalLayout>
          {children}
        </PortalLayout>
      </body>
    </html>
  );
}