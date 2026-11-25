import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PortalLayout from "@/components/PortalLayout";
import { getCurrentUser } from "@/lib/auth";
import { getPortalAlerts } from "@/lib/portal-alerts";
import "./globals.css";

const themeInitializationScript = `
  try {
    const savedTheme = window.localStorage.getItem("portal-vialoop-theme");
    const theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
`;

export const metadata: Metadata = {
  title: {
    default: "Portal Vialoop",
    template:
      "%s | Portal Vialoop",
  },
  description:
    "Portal administrativo para la gestión de clientes, proyectos, solicitudes, renovaciones, pagos y suscripciones de Vialoop.",
  icons: {
    icon: [
      {
        url: "/logo-negro-vialoop-transparente.webp",
        sizes: "512x512",
        type: "image/webp",
      },
    ],
    shortcut:
      "/logo-negro-vialoop-transparente.webp",
    apple: [
      {
        url: "/logo-negro-vialoop-transparente.webp",
        sizes: "512x512",
        type: "image/webp",
      },
    ],
  },
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

  const alerts =
    user && !isLoginPage
      ? await getPortalAlerts().catch((error) => {
          console.error("No fue posible cargar los avisos del portal:", error);
          return { items: [], total: 0, critical: 0 };
        })
      : { items: [], total: 0, critical: 0 };

  return (
    <html
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      lang="es"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitializationScript,
          }}
        />
      </head>

      <body>
        {isLoginPage ? (
          children
        ) : (
          <PortalLayout
            alerts={alerts}
            user={user!}
          >
            {children}
          </PortalLayout>
        )}
      </body>
    </html>
  );
}
