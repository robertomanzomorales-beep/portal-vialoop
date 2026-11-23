import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getClientOperationSummary,
  getLatestClientOperationTasks,
  type ClientOperationTaskRecord,
} from "@/lib/client-operation";
import { prisma } from "@/lib/prisma";
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

type ClientWorkspaceView =
  | "resumen"
  | "operacion"
  | "comercial"
  | "servicios"
  | "finanzas"
  | "ficha";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    bienvenida?: string;
    vista?: string;
  }>;
};

const workspaceTabs: Array<{ id: ClientWorkspaceView; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "operacion", label: "Operación" },
  { id: "comercial", label: "Comercial" },
  { id: "servicios", label: "Servicios" },
  { id: "finanzas", label: "Finanzas" },
  { id: "ficha", label: "Ficha maestra" },
];

function getWorkspaceView(value?: string): ClientWorkspaceView {
  return workspaceTabs.some((tab) => tab.id === value)
    ? (value as ClientWorkspaceView)
    : "resumen";
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "Sin fecha registrada";

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateKey(dateKey: string) {
  return dateKey
    ? formatDate(new Date(`${dateKey}T12:00:00.000Z`))
    : "Sin fecha objetivo";
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
  const numberValue = Number(value);

  if (value === null || value === undefined || !Number.isFinite(numberValue)) {
    return "Sin monto registrado";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function grossFromNet(netAmount: number) {
  return netAmount + Math.round(netAmount * 0.19);
}

function labelFrom(status: string, labels: Record<string, string>) {
  return labels[status] ?? status;
}

function getClientStatusLabel(status: string) {
  return labelFrom(status, {
    ACTIVE: "Activo",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  });
}

function getProjectStatusLabel(status: string) {
  return labelFrom(status, {
    DEVELOPMENT: "En desarrollo",
    ACTIVE: "Activo",
    MAINTENANCE: "En mantención",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  });
}

function getRenewalStatusLabel(status: string) {
  return labelFrom(status, {
    UPCOMING: "Próxima",
    NOTIFIED: "Notificada",
    PAID: "Pagada",
    RENEWED: "Renovada",
    EXPIRED: "Vencida",
    CANCELLED: "Cancelada",
  });
}

function getRenewalTypeLabel(type: string) {
  return labelFrom(type, {
    DOMAIN: "Dominio",
    HOSTING: "Hosting",
    EMAIL: "Correo",
    SSL: "Certificado SSL",
    SUBSCRIPTION: "Suscripción",
    ADDITIONAL_SERVICE: "Servicio adicional",
  });
}

function getSubscriptionStatusLabel(status: string) {
  return labelFrom(status, {
    ACTIVE: "Activa",
    PENDING: "Pendiente",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
  });
}

function getBillingCycleLabel(cycle: string) {
  return labelFrom(cycle, {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  });
}

function getPaymentStatusLabel(status: string) {
  return labelFrom(status, {
    PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
    CANCELLED: "Cancelado",
    REFUNDED: "Reembolsado",
  });
}

function getSupportStatusLabel(status: string) {
  return labelFrom(status, {
    RECEIVED: "Recibida",
    UNDER_REVIEW: "En revisión",
    WAITING_FOR_CLIENT: "Esperando al cliente",
    APPROVED: "Aprobada",
    IN_PROGRESS: "En proceso",
    READY_FOR_REVIEW: "Lista para revisión",
    COMPLETED: "Completada",
    REJECTED: "Rechazada",
    OUT_OF_SCOPE: "Fuera de alcance",
  });
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: ClientDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const [user, client, teamMembers] = await Promise.all([
    getCurrentUser(),
    prisma.client.findUnique({
      where: { id },
      include: {
        projects: {
          orderBy: { createdAt: "desc" },
          include: { renewals: { orderBy: { dueDate: "asc" } } },
        },
        renewals: { orderBy: { dueDate: "asc" } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: { plan: true, project: true },
        },
        payments: { orderBy: { createdAt: "desc" } },
        sales: {
          orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
          include: { payments: { orderBy: { paidAt: "desc" } } },
        },
        supportRequests: { orderBy: { createdAt: "desc" } },
        activityLogs: {
          where: {
            entityType: {
              in: ["Quotation", "ClientWelcomeEmail", "ScheduledTask"],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 250,
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

  if (!client) notFound();

  const today = chileDateKey();
  const view =
    resolvedSearchParams.bienvenida === "preparar"
      ? "operacion"
      : getWorkspaceView(resolvedSearchParams.vista);
  const clientName = client.tradeName || client.businessName;
  const mainProject = client.projects[0] ?? null;
  const nextRenewal =
    client.renewals.find((renewal) =>
      ["UPCOMING", "NOTIFIED", "EXPIRED"].includes(renewal.status),
    ) ??
    client.renewals[0] ??
    null;
  const activeSubscription =
    client.subscriptions.find(
      (subscription) => subscription.status === "ACTIVE",
    ) ??
    client.subscriptions[0] ??
    null;
  const activeServiceCount =
    client.projects.filter((project) =>
      ["DEVELOPMENT", "ACTIVE", "MAINTENANCE"].includes(project.status),
    ).length +
    (client.subscriptions.some(
      (subscription) => subscription.status === "ACTIVE",
    )
      ? 1
      : 0);
  const pendingPayments = client.payments.filter((payment) =>
    ["PENDING", "OVERDUE"].includes(payment.status),
  );
  const overduePayments = client.payments.filter(
    (payment) => payment.status === "OVERDUE",
  );
  const activeSupportRequests = client.supportRequests.filter(
    (request) =>
      !["COMPLETED", "REJECTED", "OUT_OF_SCOPE"].includes(request.status),
  );
  const quotations = client.activityLogs
    .filter((log) => log.entityType === "Quotation")
    .map((log) => ({ log, metadata: parseQuotationMetadata(log.metadata) }))
    .filter(
      (item): item is {
        log: (typeof client.activityLogs)[number];
        metadata: NonNullable<ReturnType<typeof parseQuotationMetadata>>;
      } => Boolean(item.metadata),
    );
  const quotedAmount = quotations.reduce(
    (sum, quotation) => sum + quotation.metadata.totalAmount,
    0,
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
  const operationSummary = getClientOperationSummary(
    latestOperationTasks,
    today,
  );
  const openOperationTasks = latestOperationTasks.filter(
    ({ metadata }) => metadata.status !== "COMPLETED",
  );
  const openGeneralScheduledTasks = scheduledTasks.filter(
    ({ metadata }) =>
      metadata.status !== "COMPLETED" && !isClientOperationTask(metadata),
  );
  const openScheduledTasks = [
    ...openOperationTasks,
    ...openGeneralScheduledTasks,
  ];
  const activeSales = client.sales.filter((sale) => sale.status === "ACTIVE");
  const salesNetAmount = activeSales.reduce(
    (sum, sale) => sum + Number(sale.netAmount),
    0,
  );
  const salesGrossAmount = activeSales.reduce(
    (sum, sale) => sum + grossFromNet(Number(sale.netAmount)),
    0,
  );
  const salesPaidAmount = activeSales.reduce(
    (sum, sale) =>
      sum +
      sale.payments.reduce(
        (paymentSum, payment) => paymentSum + Number(payment.amount),
        0,
      ),
    0,
  );
  const salesBalanceAmount = Math.max(salesGrossAmount - salesPaidAmount, 0);
  const servicePaidAmount = client.payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const servicePendingAmount = pendingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const totalCollected = salesPaidAmount + servicePaidAmount;
  const totalReceivable = salesBalanceAmount + servicePendingAmount;
  const salesVatAmount = salesGrossAmount - salesNetAmount;

  const priority = (() => {
    if (overduePayments.length > 0) {
      return {
        tone: "danger" as const,
        label: "Cobro vencido",
        title: `${overduePayments.length} cobro${overduePayments.length === 1 ? " requiere" : "s requieren"} gestión`,
        detail: "Revisa el pago, contacta al cliente y registra el resultado.",
        action: "Revisar finanzas",
        target: "finanzas" as ClientWorkspaceView,
      };
    }

    if (nextRenewal?.status === "EXPIRED") {
      return {
        tone: "danger" as const,
        label: "Servicio vencido",
        title: `${getRenewalTypeLabel(nextRenewal.type)} pendiente de resolución`,
        detail: "Confirma el pago o actualiza el estado de la renovación.",
        action: "Revisar servicio",
        target: "servicios" as ClientWorkspaceView,
      };
    }

    if (operationSummary.blocked > 0 || operationSummary.overdue > 0) {
      return {
        tone: "warning" as const,
        label: "Operación en riesgo",
        title:
          operationSummary.blocked > 0
            ? "La implementación tiene una etapa bloqueada"
            : `${operationSummary.overdue} etapa${operationSummary.overdue === 1 ? " está" : "s están"} atrasada${operationSummary.overdue === 1 ? "" : "s"}`,
        detail: "Asigna una decisión, responsable o nueva fecha para recuperar el flujo.",
        action: "Gestionar operación",
        target: "operacion" as ClientWorkspaceView,
      };
    }

    if (operationSummary.waitingClient > 0) {
      return {
        tone: "warning" as const,
        label: "Esperando al cliente",
        title: "La implementación necesita información o aprobación",
        detail: "Contacta al cliente y deja registrada la próxima fecha de control.",
        action: "Revisar operación",
        target: "operacion" as ClientWorkspaceView,
      };
    }

    if (!client.email) {
      return {
        tone: "neutral" as const,
        label: "Dato incompleto",
        title: "Falta el correo del contacto principal",
        detail: "Complétalo para enviar cotizaciones, avisos y documentos desde la misma ficha.",
        action: "Completar ficha",
        target: "ficha" as ClientWorkspaceView,
      };
    }

    return {
      tone: "success" as const,
      label: "Relación al día",
      title: "No hay alertas críticas para este cliente",
      detail: "La operación, los cobros y las renovaciones no presentan bloqueos registrados.",
      action: "Ver resumen",
      target: "resumen" as ClientWorkspaceView,
    };
  })();

  return (
    <main className={styles.page}>
      <header className={styles.clientWorkspaceHeader}>
        <div className={styles.clientIdentity}>
          <span className={styles.eyebrow}>Cliente 360°</span>
          <div className={styles.clientTitleLine}>
            <h1>{clientName}</h1>
            <span
              className={`${styles.status} ${
                client.status === "ACTIVE"
                  ? styles.statusActive
                  : styles.statusInactive
              }`}
            >
              {getClientStatusLabel(client.status)}
            </span>
          </div>
          <p>
            Una sola ficha para conducir la relación comercial, la entrega del
            servicio, los cobros y la continuidad.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/clientes">
            Todos los clientes
          </Link>
          <Link
            className={styles.primaryButton}
            href={`/clientes/${client.id}/editar`}
          >
            Editar ficha
          </Link>
          {user?.role === "ADMIN" && (
            <DeleteClientButton
              clientId={client.id}
              clientName={client.businessName}
            />
          )}
        </div>
      </header>

      <nav aria-label="Áreas del cliente" className={styles.workspaceNav}>
        {workspaceTabs.map((tab) => (
          <Link
            aria-current={view === tab.id ? "page" : undefined}
            className={view === tab.id ? styles.workspaceNavActive : undefined}
            href={`/clientes/${client.id}?vista=${tab.id}`}
            key={tab.id}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className={styles.clientCommandBar}>
        <div>
          <strong>Acciones del cliente</strong>
          <span>Los datos de contacto se completan desde esta ficha.</span>
        </div>
        <div className={styles.clientCommandActions}>
          <Link href={`/cotizaciones?cliente=${client.id}`}>Nueva cotización</Link>
          <Link href={`/ventas?cliente=${client.id}`}>Registrar venta</Link>
          <Link href={`/solicitudes/nuevo?cliente=${client.id}`}>Crear solicitud</Link>
          <Link href={`/planificacion?cliente=${client.id}`}>Programar tarea</Link>
        </div>
      </section>

      <section
        className={`${styles.clientPriority} ${styles[`clientPriority${priority.tone}`]}`}
      >
        <div>
          <span>{priority.label}</span>
          <strong>{priority.title}</strong>
          <p>{priority.detail}</p>
        </div>
        <Link href={`/clientes/${client.id}?vista=${priority.target}`}>
          {priority.action}
        </Link>
      </section>

      <section className={styles.summary}>
        <Link href={`/clientes/${client.id}?vista=operacion`}>
          <span>Operación abierta</span>
          <strong>{openScheduledTasks.length}</strong>
          <small>
            {operationSummary.total > 0
              ? `${operationSummary.progress}% del flujo completado`
              : "Sin flujo de implementación"}
          </small>
        </Link>
        <Link href={`/clientes/${client.id}?vista=comercial`}>
          <span>Actividad comercial</span>
          <strong>{quotations.length + activeSales.length}</strong>
          <small>
            {quotations.length} cotizaciones · {activeSales.length} ventas
          </small>
        </Link>
        <Link href={`/clientes/${client.id}?vista=finanzas`}>
          <span>Saldo por cobrar</span>
          <strong>{formatCurrency(totalReceivable)}</strong>
          <small>{pendingPayments.length} cobros de servicio abiertos</small>
        </Link>
        <Link href={`/clientes/${client.id}?vista=servicios`}>
          <span>Servicios activos</span>
          <strong>{activeServiceCount}</strong>
          <small>{client.renewals.length} renovaciones registradas</small>
        </Link>
      </section>

      {view === "resumen" && (
        <section className={styles.overviewGrid}>
          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Próxima acción operativa</h2>
                <p>Qué debe ocurrir ahora para que el servicio avance.</p>
              </div>
              <Link href={`/clientes/${client.id}?vista=operacion`}>Abrir operación</Link>
            </div>
            {operationSummary.total > 0 ? (
              <div className={styles.operationSnapshot}>
                <div>
                  <span>Etapa actual</span>
                  <strong>{operationSummary.currentTitle}</strong>
                  <small>{operationSummary.serviceName}</small>
                </div>
                <div className={styles.snapshotMeta}>
                  <span>
                    Responsable <strong>{operationSummary.responsible}</strong>
                  </span>
                  <span>
                    Fecha objetivo{" "}
                    <strong>{formatDateKey(operationSummary.targetDate)}</strong>
                  </span>
                </div>
                <div className={styles.snapshotProgress}>
                  <span style={{ width: `${operationSummary.progress}%` }} />
                </div>
              </div>
            ) : (
              <div className={styles.inlineEmpty}>
                No existe una implementación activa. Iníciala desde Operación
                cuando exista un nuevo servicio por entregar.
              </div>
            )}
          </article>

          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Pulso comercial y financiero</h2>
                <p>Compromisos vendidos, cobrados y todavía pendientes.</p>
              </div>
              <Link href={`/clientes/${client.id}?vista=finanzas`}>Ver finanzas</Link>
            </div>
            <div className={styles.overviewStats}>
              <div><span>Total cotizado</span><strong>{formatCurrency(quotedAmount)}</strong></div>
              <div><span>Venta bruta</span><strong>{formatCurrency(salesGrossAmount)}</strong></div>
              <div><span>Cobrado</span><strong>{formatCurrency(totalCollected)}</strong></div>
              <div><span>Por cobrar</span><strong>{formatCurrency(totalReceivable)}</strong></div>
            </div>
          </article>

          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Continuidad del servicio</h2>
                <p>Plan vigente y próximo compromiso recurrente.</p>
              </div>
              <Link href={`/clientes/${client.id}?vista=servicios`}>Ver servicios</Link>
            </div>
            <dl className={styles.detailList}>
              <div><dt>Plan</dt><dd>{activeSubscription?.plan.name ?? "Sin plan recurrente"}</dd></div>
              <div>
                <dt>Próxima renovación</dt>
                <dd>
                  {nextRenewal
                    ? `${getRenewalTypeLabel(nextRenewal.type)} · ${formatDate(nextRenewal.dueDate)}`
                    : "Sin renovación programada"}
                </dd>
              </div>
              <div><dt>Proyectos técnicos</dt><dd>{client.projects.length}</dd></div>
            </dl>
          </article>

          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Contacto y atención</h2>
                <p>Canal principal y requerimientos actualmente abiertos.</p>
              </div>
              <Link href={`/clientes/${client.id}?vista=ficha`}>Ver ficha</Link>
            </div>
            <dl className={styles.detailList}>
              <div><dt>Contacto</dt><dd>{client.mainContactName || "Sin contacto registrado"}</dd></div>
              <div><dt>Correo</dt><dd>{client.email || "Sin correo registrado"}</dd></div>
              <div><dt>Solicitudes abiertas</dt><dd>{activeSupportRequests.length}</dd></div>
            </dl>
          </article>
        </section>
      )}

      {view === "operacion" && (
        <>
          <ClientOperationBoard
            clientId={client.id}
            clientName={clientName}
            currentUserId={user?.id ?? teamMembers[0]?.id ?? ""}
            defaultServiceName={
              mainProject?.websiteType || mainProject?.name || "Servicio Vialoop"
            }
            tasks={latestOperationTasks}
            teamMembers={teamMembers}
            today={today}
          />
          <section className={styles.clientOperationPanel}>
            <div>
              <span className={styles.eyebrow}>Inicio de la relación</span>
              <h2>Bienvenida y recepción de material</h2>
              <p>
                Doris puede enviar un correo editable con materiales, accesos
                y próximos pasos según el servicio.
              </p>
            </div>
            <div className={styles.clientQuickActions}>
              <Link href={`/solicitudes/nuevo?cliente=${client.id}`}>
                Crear solicitud<span>Proyecto opcional</span>
              </Link>
              <Link href={`/planificacion?cliente=${client.id}`}>
                Programar trabajo<span>Plazo en calendario</span>
              </Link>
              <Link href={`/clientes/${client.id}/editar`}>
                Editar ficha<span>Contacto y servicio</span>
              </Link>
            </div>
            <WelcomeEmailComposer
              clientId={client.id}
              clientName={clientName}
              contactName={client.mainContactName ?? ""}
              initialOpen={resolvedSearchParams.bienvenida === "preparar"}
              lastSentAt={welcomeEmails[0] ? formatDate(welcomeEmails[0].createdAt) : null}
              productName={mainProject?.websiteType || mainProject?.name || "Sitio web corporativo"}
              recipient={client.email ?? ""}
              sentCount={welcomeEmails.length}
            />
          </section>

          <section className={styles.detailGrid}>
            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}>
                  <h2>Solicitudes de soporte</h2>
                  <p>Requerimientos recientes vinculados a esta ficha.</p>
                </div>
                <Link href={`/solicitudes/nuevo?cliente=${client.id}`}>Nueva solicitud</Link>
              </div>
              {client.supportRequests.length > 0 ? (
                <dl className={styles.detailList}>
                  {client.supportRequests.slice(0, 6).map((request) => (
                    <div key={request.id}>
                      <dt>
                        <Link href={`/solicitudes/${request.id}`}>{request.subject}</Link>
                        <br />{formatDate(request.createdAt)}
                      </dt>
                      <dd>{getSupportStatusLabel(request.status)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className={styles.inlineEmpty}>Este cliente todavía no tiene solicitudes de soporte.</div>
              )}
            </article>

            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}>
                  <h2>Agenda operativa</h2>
                  <p>Trabajos abiertos fuera del flujo de implementación.</p>
                </div>
                <Link href={`/planificacion?cliente=${client.id}`}>Programar</Link>
              </div>
              {openGeneralScheduledTasks.length > 0 ? (
                <dl className={styles.detailList}>
                  {openGeneralScheduledTasks.slice(0, 6).map(({ id: taskId, metadata }) => (
                    <div key={taskId}>
                      <dt>
                        <Link href="/planificacion">{metadata.title}</Link>
                        <br />{metadata.projectName || "Sin proyecto específico"}
                      </dt>
                      <dd>{formatDateKey(metadata.dueDate)}<br />{getScheduledTaskStatusLabel(metadata.status)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className={styles.inlineEmpty}>No hay trabajos abiertos. Puedes programarlos sin crear un proyecto.</div>
              )}
            </article>
          </section>
        </>
      )}

      {view === "comercial" && (
        <section className={styles.detailGrid}>
          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Cotizaciones</h2>
                <p>Propuestas emitidas desde la ficha maestra del cliente.</p>
              </div>
              <Link href={`/cotizaciones?cliente=${client.id}`}>Nueva cotización</Link>
            </div>
            {quotations.length > 0 ? (
              <dl className={styles.detailList}>
                {quotations.slice(0, 10).map(({ log, metadata }) => (
                  <div key={log.id}>
                    <dt>
                      <Link href={`/api/cotizaciones/${log.id}/pdf`} target="_blank">{metadata.number}</Link>
                      <br />{metadata.referenceName || metadata.projectName || "Propuesta general"}
                    </dt>
                    <dd>
                      {formatCurrency(metadata.totalAmount)}<br />
                      {metadata.emailStatus === "SENT" ? "Enviada" : metadata.emailStatus === "FAILED" ? "Error de envío" : "Pendiente"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className={styles.inlineEmpty}>Aún no existen cotizaciones asociadas a este cliente.</div>
            )}
          </article>

          <article className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Ventas</h2>
                <p>Negocios ganados y su avance de cobro.</p>
              </div>
              <Link href={`/ventas?cliente=${client.id}`}>Registrar venta</Link>
            </div>
            {client.sales.length > 0 ? (
              <dl className={styles.detailList}>
                {client.sales.slice(0, 10).map((sale) => {
                  const grossAmount = grossFromNet(Number(sale.netAmount));
                  const paidAmount = sale.payments.reduce(
                    (sum, payment) => sum + Number(payment.amount),
                    0,
                  );
                  const balance = Math.max(grossAmount - paidAmount, 0);

                  return (
                    <div key={sale.id}>
                      <dt>Venta N.º {sale.number} · {sale.service}<br />{formatDate(sale.saleDate)}</dt>
                      <dd>
                        {formatCurrency(grossAmount)}<br />
                        {sale.status === "CANCELLED" ? "Anulada" : balance <= 0 ? "Pagada" : `Saldo ${formatCurrency(balance)}`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <div className={styles.inlineEmpty}>No hay ventas registradas para este cliente.</div>
            )}
          </article>
        </section>
      )}

      {view === "servicios" && (
        <>
          <section className={styles.detailGrid}>
            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}>
                  <h2>Servicios técnicos</h2>
                  <p>Inventario asociado; empresa y contacto no se duplican aquí.</p>
                </div>
                <Link href="/proyectos">Gestionar</Link>
              </div>
              {client.projects.length > 0 ? (
                <div className={styles.projectStack}>
                  {client.projects.map((project) => (
                    <section className={styles.projectCard} key={project.id}>
                      <header>
                        <div><strong>{project.name}</strong><span>{project.domain || "Sin dominio registrado"}</span></div>
                        <span className={styles.projectStatus}>{getProjectStatusLabel(project.status)}</span>
                      </header>
                      <dl>
                        <div>
                          <dt>Sitio</dt>
                          <dd>{project.websiteUrl ? <a href={project.websiteUrl} rel="noreferrer" target="_blank">{project.websiteUrl}</a> : "Sin URL"}</dd>
                        </div>
                        <div><dt>Tecnología</dt><dd>{project.technology || project.websiteType || "Sin información"}</dd></div>
                        <div><dt>Hosting</dt><dd>{[project.hostingProvider, project.hostingCapacity].filter(Boolean).join(" · ") || "Sin información"}</dd></div>
                        <div><dt>Renovación hosting</dt><dd>{formatDate(project.hostingRenewalDate)}</dd></div>
                      </dl>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={styles.inlineEmpty}>Este cliente no tiene servicios técnicos registrados.</div>
              )}
            </article>

            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}>
                  <h2>Plan recurrente</h2>
                  <p>Suscripción y condiciones actualmente asignadas.</p>
                </div>
                <Link href="/suscripciones">Gestionar</Link>
              </div>
              {activeSubscription ? (
                <dl className={styles.detailList}>
                  <div><dt>Plan</dt><dd>{activeSubscription.plan.name}</dd></div>
                  <div><dt>Estado</dt><dd>{getSubscriptionStatusLabel(activeSubscription.status)}</dd></div>
                  <div><dt>Ciclo</dt><dd>{getBillingCycleLabel(activeSubscription.billingCycle)}</dd></div>
                  <div><dt>Precio acordado</dt><dd>{formatCurrency(activeSubscription.agreedPrice)}</dd></div>
                  <div><dt>Solicitudes usadas</dt><dd>{activeSubscription.requestsUsed} de {activeSubscription.plan.includedRequests}</dd></div>
                  <div><dt>Próxima renovación</dt><dd>{formatDate(activeSubscription.renewsAt)}</dd></div>
                </dl>
              ) : (
                <div className={styles.inlineEmpty}>Este cliente aún no tiene un plan recurrente asignado.</div>
              )}
            </article>
          </section>

          <section className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2>Renovaciones</h2>
                <p>Vencimientos, notificaciones y continuidad de cada servicio.</p>
              </div>
              <Link href="/renovaciones">Gestionar renovaciones</Link>
            </div>
            {client.renewals.length > 0 ? (
              <div className={styles.serviceTableWrap}>
                <table className={styles.serviceTable}>
                  <thead><tr><th>Servicio</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th>Última gestión</th></tr></thead>
                  <tbody>
                    {client.renewals.map((renewal) => (
                      <tr key={renewal.id}>
                        <td><strong>{getRenewalTypeLabel(renewal.type)}</strong><small>{renewal.description}</small></td>
                        <td>{formatDate(renewal.dueDate)}</td>
                        <td>{formatCurrency(renewal.amount)}</td>
                        <td>{getRenewalStatusLabel(renewal.status)}</td>
                        <td>
                          {renewal.renewedAt
                            ? `Renovada ${formatDate(renewal.renewedAt)}`
                            : renewal.notifiedAt
                              ? `Notificada ${formatDate(renewal.notifiedAt)}`
                              : "Sin gestión"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.inlineEmpty}>Este cliente no tiene renovaciones registradas.</div>
            )}
          </section>
        </>
      )}

      {view === "finanzas" && (
        <>
          <section className={styles.financialMetrics}>
            <article><span>Venta neta</span><strong>{formatCurrency(salesNetAmount)}</strong><small>{activeSales.length} ventas activas</small></article>
            <article><span>IVA débito asociado</span><strong>{formatCurrency(salesVatAmount)}</strong><small>19% sobre ventas registradas</small></article>
            <article><span>Total cobrado</span><strong>{formatCurrency(totalCollected)}</strong><small>Ventas y servicios recurrentes</small></article>
            <article><span>Saldo por cobrar</span><strong>{formatCurrency(totalReceivable)}</strong><small>Ventas y cobros pendientes</small></article>
          </section>

          <section className={styles.detailGrid}>
            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}><h2>Cobro de ventas</h2><p>Saldo financiero por cada negocio ganado.</p></div>
                <Link href="/ventas">Abrir ventas</Link>
              </div>
              {activeSales.length > 0 ? (
                <dl className={styles.detailList}>
                  {activeSales.slice(0, 10).map((sale) => {
                    const grossAmount = grossFromNet(Number(sale.netAmount));
                    const paidAmount = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
                    const balance = Math.max(grossAmount - paidAmount, 0);
                    return (
                      <div key={sale.id}>
                        <dt>Venta N.º {sale.number} · {sale.service}<br />Total {formatCurrency(grossAmount)}</dt>
                        <dd>Cobrado {formatCurrency(paidAmount)}<br />Saldo {formatCurrency(balance)}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <div className={styles.inlineEmpty}>No hay ventas activas para conciliar.</div>
              )}
            </article>

            <article className={styles.detailPanel}>
              <div className={styles.sectionHeaderRow}>
                <div className={styles.sectionHeader}><h2>Pagos de servicios</h2><p>Hosting, renovaciones, suscripciones y otros cobros.</p></div>
                <Link href="/pagos">Abrir pagos</Link>
              </div>
              {client.payments.length > 0 ? (
                <dl className={styles.detailList}>
                  {client.payments.slice(0, 10).map((payment) => (
                    <div key={payment.id}>
                      <dt>{payment.description}<br />{formatDate(payment.dueDate)}</dt>
                      <dd>{formatCurrency(payment.amount)}<br />{getPaymentStatusLabel(payment.status)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className={styles.inlineEmpty}>Todavía no existen pagos ni cobros de servicios registrados.</div>
              )}
            </article>
          </section>
        </>
      )}

      {view === "ficha" && (
        <>
          <section className={styles.detailGrid}>
            <article className={styles.detailPanel}>
              <div className={styles.sectionHeader}><h2>Información de la empresa</h2><p>Fuente única para datos generales y comerciales.</p></div>
              <dl className={styles.detailList}>
                <div><dt>Razón social</dt><dd>{client.businessName}</dd></div>
                <div><dt>Nombre de fantasía</dt><dd>{client.tradeName ?? "Sin información"}</dd></div>
                <div><dt>RUT</dt><dd>{client.rut ?? "Sin RUT registrado"}</dd></div>
                <div><dt>Estado</dt><dd>{getClientStatusLabel(client.status)}</dd></div>
                <div><dt>Ciudad</dt><dd>{client.city ?? "Sin ciudad registrada"}</dd></div>
                <div><dt>Dirección</dt><dd>{client.address ?? "Sin dirección registrada"}</dd></div>
                <div><dt>Cliente desde</dt><dd>{formatDate(client.joinedAt)}</dd></div>
              </dl>
            </article>
            <article className={styles.detailPanel}>
              <div className={styles.sectionHeader}><h2>Contacto principal</h2><p>Datos usados en correos, cotizaciones y notificaciones.</p></div>
              <dl className={styles.detailList}>
                <div><dt>Nombre</dt><dd>{client.mainContactName ?? "Sin contacto registrado"}</dd></div>
                <div><dt>Correo</dt><dd>{client.email ?? "Sin correo registrado"}</dd></div>
                <div><dt>Teléfono</dt><dd>{client.phone ?? "Sin teléfono registrado"}</dd></div>
              </dl>
            </article>
          </section>
          <section className={styles.detailPanel}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}><h2>Observaciones internas</h2><p>Contexto compartido por el equipo de Vialoop.</p></div>
              <Link href={`/clientes/${client.id}/editar`}>Editar información</Link>
            </div>
            <div className={styles.notesBox}>{client.internalNotes ?? "Sin observaciones registradas."}</div>
          </section>
        </>
      )}
    </main>
  );
}
