import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PortalLayout from "@/components/PortalLayout";
import {
  getCurrentUser,
} from "@/lib/auth";
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
    template:
      "%s | Portal Vialoop",
  },
  description:
    "Portal administrativo para la gestión de clientes, proyectos, solicitudes, renovaciones, pagos y suscripciones de Vialoop.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders =
    await headers();

  const pathname =
    requestHeaders.get(
      "x-portal-pathname",
    ) ?? "/";

  const isLoginPage =
    pathname === "/login";

  const user =
    await getCurrentUser();

  if (
    !isLoginPage &&
    !user
  ) {
    redirect(
      `/login?next=${encodeURIComponent(
        pathname,
      )}`,
    );
  }

  if (
    isLoginPage &&
    user
  ) {
    redirect("/");
  }

  if (
    pathname.startsWith(
      "/equipo",
    ) &&
    user?.role !== "ADMIN"
  ) {
    redirect(
      "/?error=sin-permiso",
    );
  }

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="es"
    >
      <body>
        {isLoginPage ? (
          children
        ) : (
          <PortalLayout
            user={user!}
          >
            {children}
          </PortalLayout>
        )}
      </body>
    </html>
  );
}