import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  getLatestClientOperationTasks,
  type ClientOperationTaskRecord,
} from "@/lib/client-operation";
import { parseQuotationMetadata } from "@/lib/quotation";
import {
  getScheduledTaskStatusLabel,
  isClientOperationTask,
  parseScheduledTaskMetadata,
} from "@/lib/scheduled-task";
import ClientOperationBoard from "../ClientOperationBoard";
import DeleteClientButton from "../DeleteClientButton";
import WelcomeEmailComposer from "../WelcomeEmailComposer";
import styles from "../clientes.module.css";

type ClientDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    bienvenida?: string;
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

function chileDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date());
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

function getSupportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    RECEIVED: "Recibida",
    UNDER_REVIEW: "En revisión",
    WAITING_FOR_CLIENT: "Esperando al cliente",
    APPROVED: "Aprobada",
    IN_PROGRESS: "En proceso",
    READY_FOR_REVIEW: "Lista para revisión",
    COMPLETED: "Completada",
    REJECTED: "Rechazada",
    OUT_OF_SCOPE: "Fuera de alcance",
  };

  return labels[status] ?? status;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: ClientDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const [user, client, teamMembers] = await Promise.all([
    getCurrentUser(),
    prisma.client.findUnique({
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

        activityLogs: {
          where: {
            entityType: {
              in: ["Quotation", "ClientWelcomeEmail", "ScheduledTask"],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 250,
        },

      _count: {
        select: {
          projects: true,
          renewals: true,
          subscriptions: true,
          payments: true,
          supportRequests: true,
        },
      },
      },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["ADMIN", "COLLABORATOR"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

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

  const quotations = client.activityLogs
    .filter((log) => log.entityType === "Quotation")
    .map((log) => ({
      log,
      metadata: parseQuotationMetadata(
        log.metadata,
      ),
    }))
    .filter(
      (item): item is {
        log: (typeof client.activityLogs)[number];
        metadata: NonNullable<
          ReturnType<
            typeof parseQuotationMetadata
          >
        >;
      } => Boolean(item.metadata),
    );

  const welcomeEmails = client.activityLogs.filter(
    (log) => log.entityType === "ClientWelcomeEmail",
  );
  const scheduledTasks: ClientOperationTaskRecord[] = client.activityLogs
    .filter((log) => log.entityType === "ScheduledTask")
    .map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      metadata: parseScheduledTaskMetadata(log.metadata),
    }))
    .filter(
      (item): item is ClientOperationTaskRecord => Boolean(item.metadata),
    )
    .sort((first, second) =>
      first.metadata.dueDate.localeCompare(second.metadata.dueDate),
    );
  const latestOperationTasks = getLatestClientOperationTasks(
    scheduledTasks.filter((task) => isClientOperationTask(task.metadata)),
  );
  const openScheduledTasks = scheduledTasks.filter(
    ({ metadata }) => metadata.status !== "COMPLETED",
  );
  const openGeneralScheduledTasks = openScheduledTasks.filter(
    ({ metadata }) => !isClientOperationTask(metadata),
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

          {user?.role === "ADMIN" && (
            <DeleteClientButton
              clientId={client.id}
              clientName={client.businessName}
            />
          )}
        </div>
      </header>

      <section className={styles.summary}>
        <article>
          <span>Agenda operativa</span>
          <strong>{openScheduledTasks.length}</strong>
        </article>

        <article>
          <span>Renovaciones</span>
          <strong>{client._count.renewals}</strong>
        </article>

        <article>
          <span>Cobros pendientes</span>
          <strong>{pendingPayments.length}</strong>
        </article>

        <article>
          <span>Cotizaciones</span>
          <strong>{quotations.length}</strong>
        </article>
      </section>

      <ClientOperationBoard
        clientId={client.id}
        clientName={client.tradeName || client.businessName}
        currentUserId={user?.id ?? teamMembers[0]?.id ?? ""}
        defaultServiceName={
          mainProject?.websiteType ||
          mainProject?.name ||
          "Servicio Vialoop"
        }
        tasks={latestOperationTasks}
        teamMembers={teamMembers}
        today={chileDateKey()}
      />

      <section className={styles.clientOperationPanel}>
        <div>
          <span className={styles.eyebrow}>Inicio de operación</span>
          <h2>Bienvenida y recepción de material</h2>
          <p>
            Doris puede enviar un correo profesional y editable con las fotos,
            archivos y contenidos necesarios para comenzar la implementación.
          </p>
        </div>

        <div className={styles.clientQuickActions}>
          <Link href={`/solicitudes/nuevo?cliente=${client.id}`}>
            Crear solicitud
            <span>Proyecto opcional</span>
          </Link>
          <Link href={`/planificacion?cliente=${client.id}`}>
            Programar trabajo
            <span>Plazo en calendario</span>
          </Link>
          <Link href={`/clientes/${client.id}/editar`}>
            Editar ficha maestra
            <span>Empresa, contacto y hosting</span>
          </Link>
        </div>

        <WelcomeEmailComposer
          clientId={client.id}
          clientName={client.tradeName || client.businessName}
          contactName={client.mainContactName ?? ""}
          initialOpen={resolvedSearchParams.bienvenida === "preparar"}
          lastSentAt={
            welcomeEmails[0]
              ? formatDate(welcomeEmails[0].createdAt)
              : null
          }
          productName={
            mainProject?.websiteType ||
            mainProject?.name ||
            "Sitio web corporativo"
          }
          recipient={client.email ?? ""}
          sentCount={welcomeEmails.length}
        />
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
            <h2>Solicitudes de soporte</h2>
            <p>Últimos requerimientos ordenados desde el más reciente.</p>
          </div>

          {client.supportRequests.length > 0 ? (
            <dl className={styles.detailList}>
              {client.supportRequests.slice(0, 6).map((request) => (
                <div key={request.id}>
                  <dt>
                    <Link href={`/solicitudes/${request.id}`}>
                      {request.subject}
                    </Link>
                    <br />
                    {formatDate(request.createdAt)}
                  </dt>
                  <dd>{getSupportStatusLabel(request.status)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Este cliente todavía no tiene solicitudes de soporte.
            </div>
          )}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Cotizaciones</h2>
            <p>Propuestas comerciales generadas para este cliente.</p>
          </div>

          {quotations.length > 0 ? (
            <dl className={styles.detailList}>
              {quotations.slice(0, 6).map(({ log, metadata }) => (
                <div key={log.id}>
                  <dt>
                    <Link
                      href={`/api/cotizaciones/${log.id}/pdf`}
                      target="_blank"
                    >
                      {metadata.number}
                    </Link>
                    <br />
                    {formatDate(log.createdAt)}
                  </dt>
                  <dd>
                    {formatCurrency(metadata.totalAmount)}
                    <br />
                    {metadata.emailStatus === "SENT"
                      ? "Enviada"
                      : metadata.emailStatus === "FAILED"
                        ? "Con error de envío"
                        : "Pendiente"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              Aún no existen cotizaciones asociadas a este cliente.
            </div>
          )}
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <h2>Servicios y proyectos técnicos</h2>
            <p>
              Inventario asociado a esta ficha. La empresa y el contacto no se
              vuelven a registrar aquí.
            </p>
          </div>

          {client.projects.length > 0 ? (
            <div className={styles.projectStack}>
              {client.projects.map((project) => (
                <section className={styles.projectCard} key={project.id}>
                  <header>
                    <div>
                      <strong>{project.name}</strong>
                      <span>{project.domain || "Sin dominio registrado"}</span>
                    </div>
                    <span className={styles.projectStatus}>
                      {getProjectStatusLabel(project.status)}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Sitio</dt>
                      <dd>
                        {project.websiteUrl ? (
                          <a href={project.websiteUrl} rel="noreferrer" target="_blank">
                            {project.websiteUrl}
                          </a>
                        ) : "Sin URL"}
                      </dd>
                    </div>
                    <div>
                      <dt>Tecnología</dt>
                      <dd>{project.technology || project.websiteType || "Sin información"}</dd>
                    </div>
                    <div>
                      <dt>Hosting</dt>
                      <dd>
                        {[project.hostingProvider, project.hostingCapacity]
                          .filter(Boolean)
                          .join(" · ") || "Sin información"}
                      </dd>
                    </div>
                    <div>
                      <dt>Renovación hosting</dt>
                      <dd>{formatDate(project.hostingRenewalDate)}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
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
            <h2>Agenda operativa</h2>
            <p>Trabajos abiertos vinculados a esta ficha de cliente.</p>
          </div>

          {openGeneralScheduledTasks.length > 0 ? (
            <dl className={styles.detailList}>
              {openGeneralScheduledTasks.slice(0, 6).map(({ id, metadata }) => (
                <div key={id}>
                  <dt>
                    <Link href="/planificacion">{metadata.title}</Link>
                    <br />
                    {metadata.projectName || "Sin proyecto específico"}
                  </dt>
                  <dd>
                    {formatDate(new Date(`${metadata.dueDate}T12:00:00.000Z`))}
                    <br />
                    {getScheduledTaskStatusLabel(metadata.status)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className={styles.inlineEmpty}>
              No hay trabajos abiertos. Puedes programarlos sin crear un proyecto.
            </div>
          )}
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
