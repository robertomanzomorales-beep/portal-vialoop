import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function Home() {
  const today = new Date();
  const nextThirtyDays = new Date();

  today.setHours(0, 0, 0, 0);
  nextThirtyDays.setDate(today.getDate() + 30);
  nextThirtyDays.setHours(23, 59, 59, 999);

  const [
    clientCount,
    projectCount,
    openRequestCount,
    upcomingRenewalCount,
    overdueRenewalCount,
    pendingPaymentCount,
    plans,
  ] = await Promise.all([
    prisma.client.count({
      where: {
        status: "ACTIVE",
      },
    }),

    prisma.project.count({
      where: {
        status: {
          in: ["DEVELOPMENT", "ACTIVE", "MAINTENANCE"],
        },
      },
    }),

    prisma.supportRequest.count({
      where: {
        status: {
          notIn: ["COMPLETED", "REJECTED", "OUT_OF_SCOPE"],
        },
      },
    }),

    prisma.renewal.count({
      where: {
        dueDate: {
          gte: today,
          lte: nextThirtyDays,
        },
        status: {
          in: ["UPCOMING", "NOTIFIED"],
        },
      },
    }),

    prisma.renewal.count({
      where: {
        dueDate: {
          lt: today,
        },
        status: {
          in: ["UPCOMING", "NOTIFIED", "EXPIRED"],
        },
      },
    }),

    prisma.payment.count({
      where: {
        status: {
          in: ["PENDING", "OVERDUE"],
        },
      },
    }),

    prisma.plan.findMany({
      where: {
        active: true,
      },
      orderBy: {
        monthlyPrice: "asc",
      },
    }),
  ]);

  const metrics = [
    {
      label: "Clientes activos",
      value: clientCount,
      detail: "Empresas con servicios vigentes",
      href: "/clientes",
    },
    {
      label: "Proyectos activos",
      value: projectCount,
      detail: "Sitios en desarrollo o mantención",
      href: "/proyectos",
    },
    {
      label: "Solicitudes abiertas",
      value: openRequestCount,
      detail: "Tickets pendientes de resolución",
      href: "/solicitudes",
    },
    {
      label: "Próximas renovaciones",
      value: upcomingRenewalCount,
      detail: "Vencimientos durante los próximos 30 días",
      href: "/renovaciones?filtro=30",
    },
  ];

  return (
    <div className={styles.portal}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>V</div>

          <div>
            <strong>Portal Vialoop</strong>
            <span>Gestión de clientes</span>
          </div>
        </div>

        <nav className={styles.navigation}>
          <p className={styles.navigationLabel}>Principal</p>

          <Link className={styles.activeLink} href="/">
            Dashboard
          </Link>

          <Link href="/clientes">Clientes</Link>
          <Link href="/proyectos">Proyectos</Link>
          <Link href="/solicitudes">Solicitudes</Link>

          <p className={styles.navigationLabel}>Administración</p>

          <Link href="/planes">Planes</Link>
          <Link href="/renovaciones">Renovaciones</Link>
          <Link href="/pagos">Pagos</Link>
          <Link href="/documentos">Documentos</Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.avatar}>RM</div>

          <div>
            <strong>Roberto Manzo</strong>
            <span>Administrador</span>
          </div>
        </div>
      </aside>

      <main className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Panel administrativo</span>

            <h1>Dashboard</h1>

            <p>
              Resumen general de clientes, proyectos, solicitudes,
              renovaciones y cobros de Vialoop.
            </p>
          </div>

          <Link className={styles.primaryButton} href="/clientes/nuevo">
            Nuevo cliente
          </Link>
        </header>

        <section className={styles.metrics}>
          {metrics.map((metric) => (
            <Link
              className={styles.metricCard}
              href={metric.href}
              key={metric.label}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </Link>
          ))}
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelEyebrow}>
                  Renovaciones y cobros
                </span>

                <h2>Estado operativo</h2>
              </div>

              <Link
                className={styles.secondaryButton}
                href="/renovaciones"
              >
                Ver renovaciones
              </Link>
            </div>

            <div className={styles.planList}>
              <Link
                className={styles.planItem}
                href="/renovaciones?filtro=vencidas"
              >
                <div>
                  <strong>Renovaciones vencidas</strong>
                  <span>Servicios que requieren revisión inmediata</span>
                </div>

                <strong className={styles.planPrice}>
                  {overdueRenewalCount}
                </strong>
              </Link>

              <Link
                className={styles.planItem}
                href="/renovaciones?filtro=30"
              >
                <div>
                  <strong>Próximos 30 días</strong>
                  <span>Vencimientos que deben ser gestionados</span>
                </div>

                <strong className={styles.planPrice}>
                  {upcomingRenewalCount}
                </strong>
              </Link>

              <Link className={styles.planItem} href="/pagos">
                <div>
                  <strong>Cobros pendientes</strong>
                  <span>Pagos pendientes o vencidos</span>
                </div>

                <strong className={styles.planPrice}>
                  {pendingPaymentCount}
                </strong>
              </Link>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelEyebrow}>Servicios</span>
                <h2>Planes disponibles</h2>
              </div>
            </div>

            <div className={styles.planList}>
              {plans.map((plan) => (
                <div className={styles.planItem} key={plan.id}>
                  <div>
                    <strong>{plan.name}</strong>

                    <span>
                      {plan.includedRequests === 0
                        ? "Solicitudes cotizadas por separado"
                        : `${plan.includedRequests} solicitudes incluidas`}
                    </span>
                  </div>

                  <strong className={styles.planPrice}>
                    {formatCurrency(Number(plan.monthlyPrice))}
                    <small> + IVA</small>
                  </strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}