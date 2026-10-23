"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { logout } from "@/app/login/actions";
import styles from "./PortalLayout.module.css";

type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR";
};

type PortalLayoutProps = {
  children: ReactNode;
  user: PortalUser;
};

type NavigationIconName =
  | "dashboard"
  | "followup"
  | "quote"
  | "sale"
  | "charge"
  | "clients"
  | "project"
  | "support"
  | "plan"
  | "subscription"
  | "renewal"
  | "payment"
  | "team";

type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIconName;
  adminOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const portalLogo = "/logo-negro-vialoop-transparente.webp";

const navigationGroups: NavigationGroup[] = [
  {
    label: "General",
    items: [{ label: "Dashboard", href: "/", icon: "dashboard" }],
  },
  {
    label: "Comercial",
    items: [
      { label: "Seguimiento", href: "/seguimiento", icon: "followup" },
      { label: "Cotizaciones", href: "/cotizaciones", icon: "quote" },
      { label: "Ventas", href: "/ventas", icon: "sale" },
      { label: "Cobros manuales", href: "/cobros", icon: "charge" },
    ],
  },
  {
    label: "Operación",
    items: [
      { label: "Clientes", href: "/clientes", icon: "clients" },
      { label: "Proyectos", href: "/proyectos", icon: "project" },
      { label: "Solicitudes", href: "/solicitudes", icon: "support" },
    ],
  },
  {
    label: "Servicios recurrentes",
    items: [
      { label: "Planes", href: "/planes", icon: "plan" },
      {
        label: "Suscripciones",
        href: "/suscripciones",
        icon: "subscription",
      },
      { label: "Renovaciones", href: "/renovaciones", icon: "renewal" },
      { label: "Pagos de hosting", href: "/pagos", icon: "payment" },
    ],
  },
  {
    label: "Configuración",
    items: [
      {
        label: "Equipo",
        href: "/equipo",
        icon: "team",
        adminOnly: true,
      },
    ],
  },
];

function isCurrentRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "VL";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function getRoleLabel(role: PortalUser["role"]) {
  return role === "ADMIN" ? "Administrador" : "Colaborador";
}

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const icon = (() => {
    switch (name) {
      case "dashboard":
        return (
          <>
            <rect height="6" rx="1.5" width="6" x="2.5" y="2.5" />
            <rect height="6" rx="1.5" width="6" x="11.5" y="2.5" />
            <rect height="6" rx="1.5" width="6" x="2.5" y="11.5" />
            <rect height="6" rx="1.5" width="6" x="11.5" y="11.5" />
          </>
        );
      case "followup":
        return (
          <>
            <path d="M3 4h14l-5.5 6.2v4.4l-3 1.7v-6.1L3 4Z" />
            <path d="m13.8 15.2 1.4 1.4 2.8-3" />
          </>
        );
      case "quote":
        return (
          <>
            <path d="M5 2.5h7l3 3V17.5H5Z" />
            <path d="M12 2.5v3h3M7.5 9h5M7.5 12h5" />
          </>
        );
      case "sale":
        return (
          <>
            <path d="M3 16.5V11l4-3 3 2 6-6" />
            <path d="M12.5 4H16v3.5" />
          </>
        );
      case "charge":
        return (
          <>
            <path d="M4 2.5h12v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" />
            <path d="M7 7h6M7 10h6M7 13h3" />
          </>
        );
      case "clients":
        return (
          <>
            <circle cx="8" cy="7" r="3" />
            <path d="M2.8 16.5c.4-3 2.2-4.6 5.2-4.6s4.8 1.6 5.2 4.6" />
            <path d="M13.2 5.1a2.8 2.8 0 0 1 0 4.9M14 12c2 .3 3.1 1.8 3.4 4" />
          </>
        );
      case "project":
        return (
          <>
            <path d="M2.5 5.5h6l1.5 2h7.5v9.5h-15Z" />
            <path d="M2.5 5.5V3h5l1.5 2.5" />
          </>
        );
      case "support":
        return (
          <>
            <path d="M3 3.5h14v10H9l-4 3v-3H3Z" />
            <path d="M6.5 7h7M6.5 10h4.5" />
          </>
        );
      case "plan":
        return (
          <>
            <path d="m10 2.5 7 3.5-7 3.5L3 6Z" />
            <path d="m3 10 7 3.5 7-3.5M3 14l7 3.5 7-3.5" />
          </>
        );
      case "subscription":
        return (
          <>
            <path d="M7.7 12.3 6.2 13.8a3 3 0 0 1-4.2-4.2L5.6 6a3 3 0 0 1 4.2 0" />
            <path d="m12.3 7.7 1.5-1.5A3 3 0 0 1 18 10.4L14.4 14a3 3 0 0 1-4.2 0" />
            <path d="m7 13 6-6" />
          </>
        );
      case "renewal":
        return (
          <>
            <path d="M16.8 7A7 7 0 0 0 4.2 5.1L2.5 7" />
            <path d="M2.5 3.5V7H6" />
            <path d="M3.2 13A7 7 0 0 0 15.8 14.9l1.7-1.9" />
            <path d="M17.5 16.5V13H14" />
          </>
        );
      case "payment":
        return (
          <>
            <rect height="13" rx="2" width="16" x="2" y="3.5" />
            <path d="M2 7.5h16M5 12.5h3" />
          </>
        );
      case "team":
        return (
          <>
            <circle cx="7" cy="7" r="3" />
            <circle cx="14.5" cy="8" r="2.5" />
            <path d="M2 16.5c.4-3 2.1-4.5 5-4.5s4.6 1.5 5 4.5M12.3 12.5c2.9-.5 5 .9 5.5 3.5" />
          </>
        );
    }
  })();

  return (
    <svg
      aria-hidden="true"
      className={styles.navigationIcon}
      fill="none"
      viewBox="0 0 20 20"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        {icon}
      </g>
    </svg>
  );
}

export default function PortalLayout({ children, user }: PortalLayoutProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const visibleNavigationGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => !item.adminOnly || user.role === "ADMIN",
          ),
        }))
        .filter((group) => group.items.length > 0),
    [user.role],
  );

  useEffect(() => {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => setTheme(currentTheme));

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const initials = getInitials(user.name);
  const navigating = Boolean(
    navigationTarget && !isCurrentRoute(pathname, navigationTarget),
  );

  const handleNavigation = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      isCurrentRoute(pathname, href)
    ) {
      return;
    }

    setMenuOpen(false);
    setNavigationTarget(href);
    window.setTimeout(
      () => setNavigationTarget((current) => (current === href ? null : current)),
      10_000,
    );
  };

  const setPortalTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("portal-vialoop-theme", nextTheme);
  };

  const brand = (
    <>
      <span className={styles.brandMark}>
        <Image
          alt=""
          aria-hidden="true"
          className={styles.brandLogo}
          height={40}
          priority
          src={portalLogo}
          width={40}
        />
      </span>
      <span className={styles.brandText}>
        <strong>Vialoop</strong>
        <small>Gestión integral</small>
      </span>
    </>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <Link
          className={styles.mobileBrand}
          href="/"
          onClick={(event) => handleNavigation(event, "/")}
        >
          {brand}
        </Link>

        <button
          aria-controls="portal-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          className={styles.menuButton}
          onClick={() => setMenuOpen((currentValue) => !currentValue)}
          type="button"
        >
          <span />
          <span />
        </button>
      </header>

      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className={styles.backdrop}
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}

      <aside
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
        id="portal-navigation"
      >
        <div className={styles.sidebarHeader}>
          <Link
            className={styles.brand}
            href="/"
            onClick={(event) => handleNavigation(event, "/")}
          >
            {brand}
          </Link>

          <button
            aria-label="Cerrar menú"
            className={styles.sidebarClose}
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>

        <nav aria-label="Navegación principal" className={styles.navigation}>
          {visibleNavigationGroups.map((group) => {
            const groupIsActive = group.items.some((item) =>
              isCurrentRoute(pathname, item.href),
            );

            return (
              <div
                className={`${styles.navigationGroup} ${
                  groupIsActive ? styles.navigationGroupActive : ""
                }`}
                key={group.label}
              >
                <p className={styles.navigationLabel}>{group.label}</p>

                {group.items.map((item) => {
                  const isActive = isCurrentRoute(pathname, item.href);

                  return (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={isActive ? styles.activeLink : undefined}
                      href={item.href}
                      key={item.href}
                      onClick={(event) => handleNavigation(event, item.href)}
                    >
                      <NavigationIcon name={item.icon} />
                      <span>{item.label}</span>
                      <i aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.userDetails}>
              <strong>{user.name}</strong>
              <span>{getRoleLabel(user.role)}</span>
              <small>{user.email}</small>
            </div>
          </div>

          <div className={styles.themeArea}>
            <span className={styles.themeLabel}>Apariencia</span>
            <div aria-label="Seleccionar apariencia" className={styles.themeControl} role="group">
              <button
                aria-pressed={theme === "light"}
                className={theme === "light" ? styles.themeActive : undefined}
                onClick={() => setPortalTheme("light")}
                type="button"
              >
                Claro
              </button>
              <button
                aria-pressed={theme === "dark"}
                className={theme === "dark" ? styles.themeActive : undefined}
                onClick={() => setPortalTheme("dark")}
                type="button"
              >
                Oscuro
              </button>
            </div>
          </div>

          <form action={logout}>
            <button className={styles.logoutButton} type="submit">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.main}>{children}</div>

      {navigating && (
        <div aria-live="polite" className={styles.routeProgress} role="status">
          <span>Vialoop</span>
          <i aria-hidden="true" />
          <strong>Abriendo módulo…</strong>
        </div>
      )}
    </div>
  );
}
