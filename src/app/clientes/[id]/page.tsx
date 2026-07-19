import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import styles from "../clientes.module.css";

type ClientDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Sin fecha registrada";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: unknown) {
  if (value === null || value === undefined) {
    return "Sin monto registrado";
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "Sin monto registrado";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function getClientStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Activo",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  };

  return labels[status] ?? status;
}

function getProjectStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DEVELOPMENT: "En desarrollo",
    ACTIVE: "Activo",
    MAINTENANCE: "En mantención",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  };

  return labels[status] ?? status;
}

function getRenewalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UPCOMING: "Próxima",
    NOTIFIED: "Notificada",
    PAID: "Pagada",
    RENEWED: "Renovada",
    EXPIRED: "Vencida",
    CANCELLED: "Cancelada",
  };

  return labels[status] ?? status;
}

function getRenewalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    DOMAIN: "Dominio",
    HOSTING: "Hosting",
    EMAIL: "Correo",
    SSL: "Certificado SSL",
    SUBSCRIPTION: "Suscripción",
    ADDITIONAL_SERVICE: "Servicio adicional",
  };

  return labels[type] ?? type;
}

function getSubscriptionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    PENDING: "Pendiente",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
  };

  return labels[status] ?? status;
}

function getBillingCycleLabel(cycle: string) {
  const labels: Record<string, string> = {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  return labels[cycle] ?? cycle;
}

function getPaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
    CANCELLED: "Cancelado",
    REFUNDED: "Reembolsado",
  };

  return labels[status] ?? status;
}

export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: {
      id,
    },
    include: {
      projects: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          renewals: {
            orderBy: {
              dueDate: "asc",
            },
          },
        },
      },

      renewals: {
        orderBy: {
          dueDate: "asc",
        },
      },

      subscriptions: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          plan: true,
          project: true,
        },
      },

      payments: {
        orderBy: {
          createdAt: "desc",
        },
      },

      supportRequests: {
        orderBy: {
          createdAt: "desc",
        },
      },

      documents: {
        orderBy: {
          createdAt: "desc",
        },
      },

      _count: {
        select: {
          projects: true,
          renewals: true,
          subscriptions: true,
          payments: true,
          supportRequests: true,
          documents: true,
        },
      },
    },
  });

  if (!client) {
    notFound();
  }

  const mainProject = client.projects[0] ?? null;

  const nextRenewal =
    client.renewals.find(
      (renewal) =>
        renewal.status === "UPCOMING" ||
        renewal.status === "NOTIFIED" ||
        renewal.status === "EXPIRED",
    ) ??
    client.renewals[0] ??
    null;

  const activeSubscription =
    client.subscriptions.find(
      (subscription) => subscription.status === "ACTIVE",
    ) ??
    client.subscriptions[0] ??
    null;

  const pendingPayments = client.payments.filter(
    (payment) =>
      payment.status === "PENDING" ||
      payment.status === "OVERDUE",
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Ficha del cliente</span>

          <h1>{client.businessName}</h1>

          <p>
            Información comercial, hosting, renovaciones, planes, pagos y
            soporte asociados al cliente.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/clientes">
            Volver a clientes
          </Link>

          <Link
            className={styles.primaryButton}
            href={`/clientes/${client.id}/editar`}
          >
            Editar cliente
          </Link>
        </div>
      </header>

      <section className={styles.summary}>
        <article>
          <span>Proyectos</span>
          <strong>{client._count.projects}</strong>
        </article>

        <article>
          <span>Renovaciones</span>
          <strong>{client._count.renewals}</strong>
        </article>

        <article>
          <span>Cobros pendientes</span>
          <strong>{pendingPayments.length}</strong>
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Información de la empresa</h2>
            <p>Datos generales y comerciales registrados.</p>
          </div>

          <dl className={styles.detailList}>
            <div>
              <dt>Razón social</dt>
              <dd>{client.businessName}</dd>
            </div>

            <div>
              <dt>Nombre de fantasía</dt>
              <dd>{client.tradeName ?? "Sin información"}</dd>
            </div>

            <div>
              <dt>RUT</dt>
              <dd>{client.rut ?? "Sin RUT registrado"}</dd>
            </div>

            <div>
              <dt>Estado</dt>
              <dd>{getClientStatusLabel(client.status)}</dd>
            </div>

            <div>
              <dt>Ciudad</dt>
              <dd>{client.city ?? "Sin ciudad registrada"}</dd>
            </div>

            <div>
              <dt>Dirección</dt>
              <dd>{client.address ?? "Sin dirección registrada"}</dd>
            </div>

            <div>
              <dt>Cliente desde</dt>
              <dd>{formatDate(client.joinedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Contacto principal</h2>
            <p>Datos utilizados para coordinación y notificaciones.</p>
          </div>

          <dl className={styles.detailList}>
            <div>
              <dt>Nombre</dt>
              <dd>{client.mainContactName ?? "Sin contacto registrado"}</dd>
            </div>

            <div>
              <dt>Correo</dt>
              <dd>{client.email ?? "Sin correo registrado"}</dd>
            </div>

            <div>
              <dt>Teléfono</dt>
              <dd>{client.phone ?? "Sin teléfono registrado"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Hosting y sitio web</h2>
            <p>Proyecto principal asociado al cliente.</p>
          </div>

          {mainProject ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Proyecto</dt>
                <dd>{mainProject.name}</dd>
              </div>

              <div>
                <dt>Dominio</dt>
                <dd>{mainProject.domain ?? "Sin dominio registrado"}</dd>
              </div>

              <div>
                <dt>Sitio web</dt>
                <dd>
                  {mainProject.websiteUrl ? (
                    <a
                      href={mainProject.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {mainProject.websiteUrl}
                    </a>
                  ) : (
                    "Sin URL registrada"
                  )}
                </dd>
              </div>

              <div>
                <dt>Tipo de sitio</dt>
                <dd>{mainProject.websiteType ?? "Sin información"}</dd>
              </div>

              <div>
                <dt>Tecnología</dt>
                <dd>{mainProject.technology ?? "Sin información"}</dd>
              </div>

              <div>
                <dt>Proveedor hosting</dt>
                <dd>
                  {mainProject.hostingProvider ??
                    "Sin proveedor registrado"}
                </dd>
              </div>

              <div>
                <dt>Capacidad hosting</dt>
                <dd>
                  {mainProject.hostingCapacity ??
                    "Sin capacidad registrada"}
                </dd>
              </div>

              <div>
                <dt>Renovación hosting</dt>
                <dd>{formatDate(mainProject.hostingRenewalDate)}</dd>
              </div>

              <div>
                <dt>Renovación dominio</dt>
                <dd>{formatDate(mainProject.domainRenewalDate)}</dd>
              </div>

              <div>
                <dt>Correo de formularios</dt>
                <dd>
                  {mainProject.formRecipientEmail ??
                    "Sin correo registrado"}
                </dd>
              </div>

              <div>
                <dt>Estado</dt>
                <dd>{getProjectStatusLabel(mainProject.status)}</dd>
              </div>
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Este cliente no tiene proyectos registrados.
            </div>
          )}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Próxima renovación</h2>
            <p>Información del siguiente vencimiento o cobro.</p>
          </div>

          {nextRenewal ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Tipo</dt>
                <dd>{getRenewalTypeLabel(nextRenewal.type)}</dd>
              </div>

              <div>
                <dt>Descripción</dt>
                <dd>{nextRenewal.description}</dd>
              </div>

              <div>
                <dt>Fecha de vencimiento</dt>
                <dd>{formatDate(nextRenewal.dueDate)}</dd>
              </div>

              <div>
                <dt>Monto</dt>
                <dd>{formatCurrency(nextRenewal.amount)}</dd>
              </div>

              <div>
                <dt>Estado</dt>
                <dd>{getRenewalStatusLabel(nextRenewal.status)}</dd>
              </div>

              <div>
                <dt>Notificada</dt>
                <dd>{formatDate(nextRenewal.notifiedAt)}</dd>
              </div>

              <div>
                <dt>Renovada</dt>
                <dd>{formatDate(nextRenewal.renewedAt)}</dd>
              </div>

              <div>
                <dt>Observaciones</dt>
                <dd>{nextRenewal.notes ?? "Sin observaciones"}</dd>
              </div>
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Este cliente no tiene renovaciones registradas.
            </div>
          )}
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Plan recurrente</h2>
            <p>Suscripción o plan mensual asignado.</p>
          </div>

          {activeSubscription ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Plan</dt>
                <dd>{activeSubscription.plan.name}</dd>
              </div>

              <div>
                <dt>Estado</dt>
                <dd>
                  {getSubscriptionStatusLabel(activeSubscription.status)}
                </dd>
              </div>

              <div>
                <dt>Ciclo</dt>
                <dd>
                  {getBillingCycleLabel(activeSubscription.billingCycle)}
                </dd>
              </div>

              <div>
                <dt>Precio acordado</dt>
                <dd>{formatCurrency(activeSubscription.agreedPrice)}</dd>
              </div>

              <div>
                <dt>Solicitudes usadas</dt>
                <dd>
                  {activeSubscription.requestsUsed} de{" "}
                  {activeSubscription.plan.includedRequests}
                </dd>
              </div>

              <div>
                <dt>Inicio</dt>
                <dd>{formatDate(activeSubscription.startsAt)}</dd>
              </div>

              <div>
                <dt>Próxima renovación</dt>
                <dd>{formatDate(activeSubscription.renewsAt)}</dd>
              </div>

              <div>
                <dt>Término</dt>
                <dd>{formatDate(activeSubscription.endsAt)}</dd>
              </div>
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Este cliente aún no tiene un plan recurrente asignado.
            </div>
          )}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Estado operativo</h2>
            <p>Resumen de registros asociados al cliente.</p>
          </div>

          <dl className={styles.detailList}>
            <div>
              <dt>Solicitudes de soporte</dt>
              <dd>{client._count.supportRequests}</dd>
            </div>

            <div>
              <dt>Documentos</dt>
              <dd>{client._count.documents}</dd>
            </div>

            <div>
              <dt>Pagos registrados</dt>
              <dd>{client._count.payments}</dd>
            </div>

            <div>
              <dt>Suscripciones</dt>
              <dd>{client._count.subscriptions}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Últimos pagos</h2>
            <p>Pagos y cobros registrados para el cliente.</p>
          </div>

          {client.payments.length > 0 ? (
            <dl className={styles.detailList}>
              {client.payments.slice(0, 5).map((payment) => (
                <div key={payment.id}>
                  <dt>
                    {payment.description}
                    <br />
                    {formatDate(payment.dueDate)}
                  </dt>

                  <dd>
                    {formatCurrency(payment.amount)}
                    <br />
                    {getPaymentStatusLabel(payment.status)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Todavía no existen pagos ni cobros registrados.
            </div>
          )}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Observaciones internas</h2>
            <p>Información visible únicamente para Vialoop.</p>
          </div>

          <div className={styles.notesBox}>
            {client.internalNotes ?? "Sin observaciones registradas."}
          </div>
        </article>
      </section>
    </main>
  );
}