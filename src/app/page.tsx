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

  nextThirtyDays.setDate(today.getDate() + 30);

  const [
    clientCount,
    projectCount,
    openRequestCount,
    upcomingRenewalCount,
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
    },
    {
      label: "Proyectos activos",
      value: projectCount,
      detail: "Sitios en desarrollo o mantención",
    },
    {
      label: "Solicitudes abiertas",
      value: openRequestCount,
      detail: "Tickets pendientes de resolución",
    },
    {
      label: "Próximas renovaciones",
      value: upcomingRenewalCount,
      detail: "Vencimientos durante los próximos 30 días",
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

          <a className={styles.activeLink} href="/">
            Dashboard
          </a>

          <a href="#">Clientes</a>
          <a href="#">Proyectos</a>
          <a href="#">Solicitudes</a>

          <p className={styles.navigationLabel}>Administración</p>

          <a href="#">Planes</a>
          <a href="#">Renovaciones</a>
          <a href="#">Pagos</a>
          <a href="#">Documentos</a>
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
              Resumen general de clientes, proyectos, solicitudes y
              renovaciones de Vialoop.
            </p>
          </div>

          <button type="button" className={styles.primaryButton}>
            Nuevo cliente
          </button>
        </header>

        <section className={styles.metrics}>
          {metrics.map((metric) => (
            <article className={styles.metricCard} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelEyebrow}>Operación</span>
                <h2>Actividad reciente</h2>
              </div>

              <button type="button" className={styles.secondaryButton}>
                Ver solicitudes
              </button>
            </div>

            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>✓</div>
              <h3>No existen solicitudes registradas</h3>
              <p>
                Cuando los clientes creen solicitudes de soporte, aparecerán
                aquí para su seguimiento.
              </p>
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