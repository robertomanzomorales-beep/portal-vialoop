import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./solicitudes.module.css";

type SupportRequestsPageProps = {
  searchParams: Promise<{
    estado?: string;
    prioridad?: string;
    q?: string;
    resultado?: string;
  }>;
};

type StatusFilter =
  | "todas"
  | "abiertas"
  | "recibidas"
  | "revision"
  | "progreso"
  | "espera"
  | "completadas"
  | "cerradas";

type PriorityFilter =
  | "todas"
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "URGENT";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    RECEIVED: "Recibida",
    UNDER_REVIEW: "En revisión",
    WAITING_FOR_CLIENT: "Esperando cliente",
    APPROVED: "Aprobada",
    IN_PROGRESS: "En proceso",
    READY_FOR_REVIEW: "Lista para revisión",
    COMPLETED: "Completada",
    REJECTED: "Rechazada",
    OUT_OF_SCOPE: "Fuera de alcance",
  };

  return labels[status] ?? status;
}

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    RECEIVED: styles.statusReceived,
    UNDER_REVIEW: styles.statusReview,
    WAITING_FOR_CLIENT: styles.statusWaiting,
    APPROVED: styles.statusApproved,
    IN_PROGRESS: styles.statusProgress,
    READY_FOR_REVIEW: styles.statusReady,
    COMPLETED: styles.statusCompleted,
    REJECTED: styles.statusRejected,
    OUT_OF_SCOPE: styles.statusOutOfScope,
  };

  return classes[status] ?? styles.statusReceived;
}

function getPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Baja",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority] ?? priority;
}

function getPriorityClass(priority: string) {
  const classes: Record<string, string> = {
    LOW: styles.priorityLow,
    NORMAL: styles.priorityNormal,
    HIGH: styles.priorityHigh,
    URGENT: styles.priorityUrgent,
  };

  return classes[priority] ?? styles.priorityNormal;
}

function isOpenStatus(status: string) {
  return ![
    "COMPLETED",
    "REJECTED",
    "OUT_OF_SCOPE",
  ].includes(status);
}

function matchesStatusFilter(
  status: string,
  filter: StatusFilter,
) {
  if (filter === "todas") {
    return true;
  }

  if (filter === "abiertas") {
    return isOpenStatus(status);
  }

  if (filter === "recibidas") {
    return status === "RECEIVED";
  }

  if (filter === "revision") {
    return [
      "UNDER_REVIEW",
      "READY_FOR_REVIEW",
    ].includes(status);
  }

  if (filter === "progreso") {
    return [
      "APPROVED",
      "IN_PROGRESS",
    ].includes(status);
  }

  if (filter === "espera") {
    return status === "WAITING_FOR_CLIENT";
  }

  if (filter === "completadas") {
    return status === "COMPLETED";
  }

  if (filter === "cerradas") {
    return !isOpenStatus(status);
  }

  return true;
}

function normalizeSearchValue(
  value: string | null | undefined,
) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function matchesSearch(
  request: {
    number: number;
    subject: string;
    description: string;
    requesterName: string | null;
    requesterEmail: string | null;
    client: {
      businessName: string;
      tradeName: string | null;
      email: string | null;
    } | null;
    project: {
      name: string;
      domain: string | null;
    } | null;
  },
  query: string,
) {
  if (!query) {
    return true;
  }

  const values = [
    request.number.toString(),
    request.subject,
    request.description,
    request.requesterName,
    request.requesterEmail,
    request.client?.businessName,
    request.client?.tradeName,
    request.client?.email,
    request.project?.name,
    request.project?.domain,
  ];

  return values.some((value) =>
    normalizeSearchValue(value).includes(query),
  );
}

function buildFilterHref({
  status,
  priority,
  query,
}: {
  status: StatusFilter;
  priority: PriorityFilter;
  query: string;
}) {
  const params = new URLSearchParams();

  if (status !== "todas") {
    params.set("estado", status);
  }

  if (priority !== "todas") {
    params.set("prioridad", priority);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();

  return search
    ? `/solicitudes?${search}`
    : "/solicitudes";
}

export default async function SupportRequestsPage({
  searchParams,
}: SupportRequestsPageProps) {
  const resolvedSearchParams = await searchParams;

  const allowedStatusFilters: StatusFilter[] = [
    "todas",
    "abiertas",
    "recibidas",
    "revision",
    "progreso",
    "espera",
    "completadas",
    "cerradas",
  ];

  const allowedPriorityFilters: PriorityFilter[] = [
    "todas",
    "LOW",
    "NORMAL",
    "HIGH",
    "URGENT",
  ];

  const requestedStatus =
    resolvedSearchParams.estado ?? "todas";

  const requestedPriority =
    resolvedSearchParams.prioridad ?? "todas";

  const activeStatus =
    allowedStatusFilters.includes(
      requestedStatus as StatusFilter,
    )
      ? (requestedStatus as StatusFilter)
      : "todas";

  const activePriority =
    allowedPriorityFilters.includes(
      requestedPriority as PriorityFilter,
    )
      ? (requestedPriority as PriorityFilter)
      : "todas";

  const searchQuery = normalizeSearchValue(
    resolvedSearchParams.q,
  );

  const requests =
    await prisma.supportRequest.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        client: true,
        project: true,
        assignedTo: true,
        _count: {
          select: {
            attachments: true,
            comments: true,
          },
        },
      },
    });

  const filteredRequests = requests.filter((request) => {
    const matchesStatus = matchesStatusFilter(
      request.status,
      activeStatus,
    );

    const matchesPriority =
      activePriority === "todas" ||
      request.priority === activePriority;

    return (
      matchesStatus &&
      matchesPriority &&
      matchesSearch(request, searchQuery)
    );
  });

  const openCount = requests.filter((request) =>
    isOpenStatus(request.status),
  ).length;

  const urgentCount = requests.filter(
    (request) =>
      request.priority === "URGENT" &&
      isOpenStatus(request.status),
  ).length;

  const completedCount = requests.filter(
    (request) => request.status === "COMPLETED",
  ).length;

  const statusFilters: Array<{
    label: string;
    value: StatusFilter;
    count: number;
  }> = [
    {
      label: "Todas",
      value: "todas",
      count: requests.length,
    },
    {
      label: "Abiertas",
      value: "abiertas",
      count: openCount,
    },
    {
      label: "Recibidas",
      value: "recibidas",
      count: requests.filter(
        (request) => request.status === "RECEIVED",
      ).length,
    },
    {
      label: "En revisión",
      value: "revision",
      count: requests.filter((request) =>
        [
          "UNDER_REVIEW",
          "READY_FOR_REVIEW",
        ].includes(request.status),
      ).length,
    },
    {
      label: "En proceso",
      value: "progreso",
      count: requests.filter((request) =>
        [
          "APPROVED",
          "IN_PROGRESS",
        ].includes(request.status),
      ).length,
    },
    {
      label: "Esperando cliente",
      value: "espera",
      count: requests.filter(
        (request) =>
          request.status === "WAITING_FOR_CLIENT",
      ).length,
    },
    {
      label: "Completadas",
      value: "completadas",
      count: completedCount,
    },
    {
      label: "Cerradas",
      value: "cerradas",
      count: requests.filter(
        (request) => !isOpenStatus(request.status),
      ).length,
    },
  ];

  const priorityFilters: Array<{
    label: string;
    value: PriorityFilter;
    count: number;
  }> = [
    {
      label: "Todas las prioridades",
      value: "todas",
      count: requests.length,
    },
    {
      label: "Baja",
      value: "LOW",
      count: requests.filter(
        (request) => request.priority === "LOW",
      ).length,
    },
    {
      label: "Normal",
      value: "NORMAL",
      count: requests.filter(
        (request) => request.priority === "NORMAL",
      ).length,
    },
    {
      label: "Alta",
      value: "HIGH",
      count: requests.filter(
        (request) => request.priority === "HIGH",
      ).length,
    },
    {
      label: "Urgente",
      value: "URGENT",
      count: requests.filter(
        (request) => request.priority === "URGENT",
      ).length,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Soporte y operación
          </span>

          <h1>Solicitudes</h1>

          <p>
            Registra, prioriza y controla las solicitudes de
            soporte asociadas a clientes y proyectos de Vialoop.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href="/"
          >
            Volver al dashboard
          </Link>

          <Link
            className={styles.primaryButton}
            href="/solicitudes/nuevo"
          >
            Nueva solicitud
          </Link>
        </div>
      </header>

      {resolvedSearchParams.resultado === "creada" && (
        <div className={styles.successMessage}>
          La solicitud fue creada correctamente.
        </div>
      )}

      <section className={styles.summary}>
        <article>
          <span>Solicitudes registradas</span>
          <strong>{requests.length}</strong>
          <p>Total almacenado en el sistema</p>
        </article>

        <article>
          <span>Solicitudes abiertas</span>
          <strong>{openCount}</strong>
          <p>Pendientes de resolución</p>
        </article>

        <article
          className={
            urgentCount > 0
              ? styles.alertCard
              : undefined
          }
        >
          <span>Solicitudes urgentes</span>
          <strong>{urgentCount}</strong>
          <p>Requieren atención prioritaria</p>
        </article>

        <article>
          <span>Solicitudes completadas</span>
          <strong>{completedCount}</strong>
          <p>Casos resueltos y cerrados</p>
        </article>
      </section>

      <section className={styles.controls}>
        <form className={styles.searchForm} method="get">
          {activeStatus !== "todas" && (
            <input
              name="estado"
              type="hidden"
              value={activeStatus}
            />
          )}

          {activePriority !== "todas" && (
            <input
              name="prioridad"
              type="hidden"
              value={activePriority}
            />
          )}

          <label className={styles.searchField}>
            <span>Buscar solicitud</span>

            <div className={styles.searchRow}>
              <input
                defaultValue={
                  resolvedSearchParams.q ?? ""
                }
                name="q"
                placeholder="Número, cliente, proyecto o asunto"
                type="search"
              />

              <button type="submit">
                Buscar
              </button>

              {(searchQuery ||
                activeStatus !== "todas" ||
                activePriority !== "todas") && (
                <Link href="/solicitudes">
                  Limpiar
                </Link>
              )}
            </div>
          </label>
        </form>

        <div className={styles.filterGroups}>
          <div>
            <span className={styles.filterLabel}>
              Estado
            </span>

            <nav
              aria-label="Filtros por estado"
              className={styles.filters}
            >
              {statusFilters.map((filter) => (
                <Link
                  className={`${styles.filterButton} ${
                    activeStatus === filter.value
                      ? styles.activeFilter
                      : ""
                  }`}
                  href={buildFilterHref({
                    status: filter.value,
                    priority: activePriority,
                    query: searchQuery,
                  })}
                  key={filter.value}
                >
                  {filter.label}
                  <span>{filter.count}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <span className={styles.filterLabel}>
              Prioridad
            </span>

            <nav
              aria-label="Filtros por prioridad"
              className={styles.filters}
            >
              {priorityFilters.map((filter) => (
                <Link
                  className={`${styles.filterButton} ${
                    activePriority === filter.value
                      ? styles.activeFilter
                      : ""
                  }`}
                  href={buildFilterHref({
                    status: activeStatus,
                    priority: filter.value,
                    query: searchQuery,
                  })}
                  key={filter.value}
                >
                  {filter.label}
                  <span>{filter.count}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Registro de solicitudes</h2>

            <p>
              Se muestran {filteredRequests.length} solicitudes
              según los filtros seleccionados.
            </p>
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>+</div>

            <h3>
              No existen solicitudes para este filtro
            </h3>

            <p>
              Crea una solicitud nueva o selecciona otro estado
              para revisar los demás registros.
            </p>

            <Link
              className={styles.primaryButton}
              href="/solicitudes/nuevo"
            >
              Crear solicitud
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente / proyecto</th>
                  <th>Solicitud</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th>Entrega estimada</th>
                  <th>Actividad</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong
                        className={styles.requestNumber}
                      >
                        #
                        {request.number
                          .toString()
                          .padStart(4, "0")}
                      </strong>

                      <span
                        className={styles.secondaryText}
                      >
                        {formatDateTime(
                          request.createdAt,
                        )}
                      </span>
                    </td>

                    <td>
                      {request.client && request.clientId ? (
                        <Link
                          className={styles.clientLink}
                          href={`/clientes/${request.clientId}`}
                        >
                          <strong>
                            {request.client.businessName}
                          </strong>

                          <span>
                            {request.project?.domain ??
                              request.project?.name ??
                              request.requesterEmail ??
                              "Sin proyecto asociado"}
                          </span>
                        </Link>
                      ) : (
                        <div className={styles.clientLink}>
                          <strong>
                            {request.requesterName ??
                              "Remitente sin asociar"}
                          </strong>

                          <span>
                            {request.requesterEmail ??
                              "Correo no identificado"}
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      <strong className={styles.subject}>
                        {request.subject}
                      </strong>

                      <span
                        className={styles.description}
                      >
                        {request.description}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`${styles.priority} ${getPriorityClass(
                          request.priority,
                        )}`}
                      >
                        {getPriorityLabel(
                          request.priority,
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`${styles.status} ${getStatusClass(
                          request.status,
                        )}`}
                      >
                        {getStatusLabel(
                          request.status,
                        )}
                      </span>
                    </td>

                    <td>
                      <strong className={styles.assignee}>
                        {request.assignedTo?.name ??
                          "Sin asignar"}
                      </strong>
                    </td>

                    <td>
                      <strong
                        className={styles.dateValue}
                      >
                        {formatDate(
                          request.estimatedDelivery,
                        )}
                      </strong>
                    </td>

                    <td>
                      <div className={styles.recordList}>
                        <span>
                          {request._count.comments} comentarios
                        </span>

                        <span>
                          {request._count.attachments} archivos
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className={styles.actions}>
                        <Link
                          className={styles.primaryButton}
                          href={`/solicitudes/${request.id}`}
                        >
                          Ver solicitud
                        </Link>

                        {request.clientId && (
                          <Link
                            className={styles.viewButton}
                            href={`/clientes/${request.clientId}`}
                          >
                            Ver cliente
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
