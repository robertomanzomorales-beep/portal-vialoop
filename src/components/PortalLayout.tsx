"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { logout } from "@/app/login/actions";
import styles from "./PortalLayout.module.css";

type PortalUser = {
  id: string;
  name: string;
  email: string;
  role:
    | "ADMIN"
    | "COLLABORATOR";
};

type PortalLayoutProps = {
  children: ReactNode;
  user: PortalUser;
};

type NavigationItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const portalLogo =
  "/logo-negro-vialoop-transparente.webp";

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
        label: "Ventas",
        href: "/ventas",
      },
{
        label: "Cobros",
        href: "/cobros",
      },
      {
        label: "Documentos",
        href: "/documentos",
      },
      {
        label: "Equipo",
        href: "/equipo",
        adminOnly: true,
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
    pathname.startsWith(
      `${href}/`,
    )
  );
}

function getInitials(
  name: string,
) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "VL";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0]}${
    words[words.length - 1][0]
  }`.toUpperCase();
}

function getRoleLabel(
  role: PortalUser["role"],
) {
  return role === "ADMIN"
    ? "Administrador"
    : "Colaborador";
}

export default function PortalLayout({
  children,
  user,
}: PortalLayoutProps) {
  const pathname = usePathname();

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const visibleNavigationGroups =
    useMemo(
      () =>
        navigationGroups.map(
          (group) => ({
            ...group,
            items: group.items.filter(
              (item) =>
                !item.adminOnly ||
                user.role ===
                  "ADMIN",
            ),
          }),
        ),
      [user.role],
    );

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
      if (
        event.key === "Escape"
      ) {
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

  const initials =
    getInitials(user.name);

  return (
    <div className={styles.shell}>
      <header
        className={
          styles.mobileHeader
        }
      >
        <Link
          className={
            styles.mobileBrand
          }
          href="/"
        >
          <span
            className={
              styles.mobileBrandMark
            }
          >
            <Image
              alt=""
              aria-hidden="true"
              className={
                styles.mobileBrandLogo
              }
              height={42}
              src={portalLogo}
              width={42}
            />
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
          className={
            styles.menuButton
          }
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
          className={
            styles.backdrop
          }
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
              className={
                styles.brandMark
              }
            >
              <Image
                alt=""
                aria-hidden="true"
                className={
                  styles.brandLogo
                }
                height={48}
                src={portalLogo}
                width={48}
              />
            </span>

            <span
              className={
                styles.brandText
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
          className={
            styles.navigation
          }
        >
          {visibleNavigationGroups.map(
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
          <div
            className={
              styles.userRow
            }
          >
            <div
              className={
                styles.avatar
              }
            >
              {initials}
            </div>

            <div
              className={
                styles.userDetails
              }
            >
              <strong>
                {user.name}
              </strong>

              <span>
                {getRoleLabel(
                  user.role,
                )}
              </span>

              <small>
                {user.email}
              </small>
            </div>
          </div>

          <form action={logout}>
            <button
              className={
                styles.logoutButton
              }
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.main}>
        {children}
      </div>
    </div>
  );
}