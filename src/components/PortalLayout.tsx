"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import styles from "./PortalLayout.module.css";

type PortalLayoutProps = {
  children: ReactNode;
};

type NavigationItem = {
  label: string;
  href: string;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Principal",
    items: [
      {
        label: "Dashboard",
        href: "/",
      },
      {
        label: "Clientes",
        href: "/clientes",
      },
      {
        label: "Proyectos",
        href: "/proyectos",
      },
      {
        label: "Solicitudes",
        href: "/solicitudes",
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Planes",
        href: "/planes",
      },
      {
        label: "Suscripciones",
        href: "/suscripciones",
      },
      {
        label: "Renovaciones",
        href: "/renovaciones",
      },
      {
        label: "Pagos",
        href: "/pagos",
      },
      {
        label: "Documentos",
        href: "/documentos",
      },
      {
        label: "Equipo",
        href: "/equipo",
      },
    ],
  },
];

function isCurrentRoute(
  pathname: string,
  href: string,
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

export default function PortalLayout({
  children,
}: PortalLayoutProps) {
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] =
    useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow =
      "hidden";

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [menuOpen]);

  return (
    <div className={styles.shell}>
      <header
        className={styles.mobileHeader}
      >
        <Link
          className={styles.mobileBrand}
          href="/"
        >
          <span
            className={
              styles.mobileBrandMark
            }
          >
            V
          </span>

          <span
            className={
              styles.mobileBrandText
            }
          >
            <strong>
              Portal Vialoop
            </strong>

            <small>
              Gestión de clientes
            </small>
          </span>
        </Link>

        <button
          aria-controls="portal-navigation"
          aria-expanded={menuOpen}
          aria-label={
            menuOpen
              ? "Cerrar menú"
              : "Abrir menú"
          }
          className={styles.menuButton}
          onClick={() =>
            setMenuOpen(
              (currentValue) =>
                !currentValue,
            )
          }
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className={styles.backdrop}
          onClick={() =>
            setMenuOpen(false)
          }
          type="button"
        />
      )}

      <aside
        className={`${styles.sidebar} ${
          menuOpen
            ? styles.sidebarOpen
            : ""
        }`}
        id="portal-navigation"
      >
        <div
          className={
            styles.sidebarHeader
          }
        >
          <Link
            className={styles.brand}
            href="/"
          >
            <span
              className={styles.brandMark}
            >
              V
            </span>

            <span
              className={styles.brandText}
            >
              <strong>
                Portal Vialoop
              </strong>

              <small>
                Gestión de clientes
              </small>
            </span>
          </Link>

          <button
            aria-label="Cerrar menú"
            className={
              styles.sidebarClose
            }
            onClick={() =>
              setMenuOpen(false)
            }
            type="button"
          >
            ×
          </button>
        </div>

        <nav
          aria-label="Navegación principal"
          className={styles.navigation}
        >
          {navigationGroups.map(
            (group) => (
              <div
                className={
                  styles.navigationGroup
                }
                key={group.label}
              >
                <p
                  className={
                    styles.navigationLabel
                  }
                >
                  {group.label}
                </p>

                {group.items.map(
                  (item) => {
                    const isActive =
                      isCurrentRoute(
                        pathname,
                        item.href,
                      );

                    return (
                      <Link
                        aria-current={
                          isActive
                            ? "page"
                            : undefined
                        }
                        className={
                          isActive
                            ? styles.activeLink
                            : undefined
                        }
                        href={item.href}
                        key={item.href}
                      >
                        {item.label}
                      </Link>
                    );
                  },
                )}
              </div>
            ),
          )}
        </nav>

        <div
          className={
            styles.sidebarFooter
          }
        >
          <div className={styles.avatar}>
            RM
          </div>

          <div>
            <strong>
              Roberto Manzo
            </strong>

            <span>
              Administrador
            </span>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        {children}
      </div>
    </div>
  );
}