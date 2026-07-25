import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./suscripciones.module.css";

type SubscriptionsPageProps = {
  searchParams: Promise<{
    estado?: string;
    q?: string;
    resultado?: string;
  }>;
};

type StatusFilter =
  | "todas"
  | "ACTIVE"
  | "PENDING"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

function formatCurrency(
  value: unknown,
) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "Sin monto";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(
  date: Date | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function normalizeSearch(
  value: string | null | undefined,
) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function getStatusLabel(
  status: string,
) {
  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    PENDING: "Pendiente",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
  };

  return labels[status] ?? status;
}

function getStatusClass(
  status: string,
) {
  const classes: Record<string, string> = {
    ACTIVE: styles.statusActive,
    PENDING: styles.statusPending,
    SUSPENDED:
      styles.statusSuspended,
    CANCELLED:
      styles.statusCancelled,
    EXPIRED: styles.statusExpired,
  };

  return (
    classes[status] ??
    styles.statusPending
  );
}

function getCycleLabel(
  cycle: string,
) {
  const labels: Record<string, string> = {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  return labels[cycle] ?? cycle;
}

function getCycleDescription(
  cycle: string,
) {
  const labels: Record<string, string> = {
    MONTHLY: "por mes",
    SEMIANNUAL: "por semestre",
    ANNUAL: "por año",
  };

  return labels[cycle] ?? "";
}

function buildFilterHref({
  status,
  query,
}: {
  status: StatusFilter;
  query: string;
}) {
  const params =
    new URLSearchParams();

  if (status !== "todas") {
    params.set("estado", status);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();

  return search
    ? `/suscripciones?${search}`
    : "/suscripciones";
}

export default async function SubscriptionsPage({
  searchParams,
}: SubscriptionsPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const allowedStatuses: StatusFilter[] = [
    "todas",
    "ACTIVE",
    "PENDING",
    "SUSPENDED",
    "CANCELLED",
    "EXPIRED",
  ];

  const requestedStatus =
    resolvedSearchParams.estado ??
    "todas";

  const activeStatus =
    allowedStatuses.includes(
      requestedStatus as StatusFilter,
    )
      ? (requestedStatus as StatusFilter)
      : "todas";

  const searchQuery = normalizeSearch(
    resolvedSearchParams.q,
  );

  const subscriptions =
    await prisma.subscription.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        client: true,
        project: true,
        plan: true,
        _count: {
          select: {
            payments: true,
            renewals: true,
          },
        },
      },
    });

  const filteredSubscriptions =
    subscriptions.filter(
      (subscription) => {
        const matchesStatus =
          activeStatus === "todas" ||
          subscription.status ===
            activeStatus;

        const values = [
          subscription.client
            .businessName,
          subscription.client
            .tradeName,
          subscription.client.email,
          subscription.project?.name,
          subscription.project?.domain,
          subscription.plan.name,
          getCycleLabel(
            subscription.billingCycle,
          ),
          getStatusLabel(
            subscription.status,
          ),
        ];

        const matchesSearch =
          !searchQuery ||
          values.some((value) =>
            normalizeSearch(
              value,
            ).includes(searchQuery),
          );

        return (
          matchesStatus &&
          matchesSearch
        );
      },
    );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextThirtyDays =
    new Date(today);

  nextThirtyDays.setDate(
    nextThirtyDays.getDate() + 30,
  );

  nextThirtyDays.setHours(
    23,
    59,
    59,
    999,
  );

  const activeCount =
    subscriptions.filter(
      (subscription) =>
        subscription.status ===
        "ACTIVE",
    ).length;

  const pendingCount =
    subscriptions.filter(
      (subscription) =>
        subscription.status ===
        "PENDING",
    ).length;

  const upcomingRenewalCount =
    subscriptions.filter(
      (subscription) =>
        subscription.renewsAt &&
        subscription.renewsAt >=
          today &&
        subscription.renewsAt <=
          nextThirtyDays &&
        [
          "ACTIVE",
          "PENDING",
        ].includes(
          subscription.status,
        ),
    ).length;

  const filters: Array<{
    label: string;
    value: StatusFilter;
    count: number;
  }> = [
    {
      label: "Todas",
      value: "todas",
      count:
        subscriptions.length,
    },
    {
      label: "Activas",
      value: "ACTIVE",
      count: activeCount,
    },
    {
      label: "Pendientes",
      value: "PENDING",
      count: pendingCount,
    },
    {
      label: "Suspendidas",
      value: "SUSPENDED",
      count:
        subscriptions.filter(
          (subscription) =>
            subscription.status ===
            "SUSPENDED",
        ).length,
    },
    {
      label: "Canceladas",
      value: "CANCELLED",
      count:
        subscriptions.filter(
          (subscription) =>
            subscription.status ===
            "CANCELLED",
        ).length,
    },
    {
      label: "Vencidas",
      value: "EXPIRED",
      count:
        subscriptions.filter(
          (subscription) =>
            subscription.status ===
            "EXPIRED",
        ).length,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span
            className={styles.eyebrow}
          >
            Servicios recurrentes
          </span>

          <h1>Suscripciones</h1>

          <p>
            Vincula clientes y proyectos con
            los planes comerciales, precios
            acordados, ciclos de cobro y
            próximas renovaciones.
          </p>
        </div>

        <div
          className={
            styles.headerActions
          }
        >
          <Link
            className={
              styles.secondaryButton
            }
            href="/planes"
          >
            Ver planes
          </Link>

          <Link
            className={
              styles.primaryButton
            }
            href="/suscripciones/nuevo"
          >
            Nueva suscripción
          </Link>
        </div>
      </header>

      <section
        className={styles.summary}
      >
        <article>
          <span>
            Suscripciones registradas
          </span>

          <strong>
            {subscriptions.length}
          </strong>

          <p>
            Total almacenado en el sistema
          </p>
        </article>

        <article>
          <span>
            Suscripciones activas
          </span>

          <strong>
            {activeCount}
          </strong>

          <p>
            Servicios actualmente vigentes
          </p>
        </article>

        <article>
          <span>
            Suscripciones pendientes
          </span>

          <strong>
            {pendingCount}
          </strong>

          <p>
            Pendientes de activación
          </p>
        </article>

        <article>
          <span>
            Próximas renovaciones
          </span>

          <strong>
            {upcomingRenewalCount}
          </strong>

          <p>
            Durante los próximos 30 días
          </p>
        </article>
      </section>

      <section
        className={styles.controls}
      >
        <form
          className={styles.searchForm}
          method="get"
        >
          {activeStatus !==
            "todas" && (
            <input
              name="estado"
              type="hidden"
              value={activeStatus}
            />
          )}

          <label
            className={
              styles.searchField
            }
          >
            <span>
              Buscar suscripción
            </span>

            <div
              className={
                styles.searchRow
              }
            >
              <input
                defaultValue={
                  resolvedSearchParams.q ??
                  ""
                }
                name="q"
                placeholder="Cliente, dominio, proyecto o plan"
                type="search"
              />

              <button type="submit">
                Buscar
              </button>

              {(searchQuery ||
                activeStatus !==
                  "todas") && (
                <Link href="/suscripciones">
                  Limpiar
                </Link>
              )}
            </div>
          </label>
        </form>

        <nav
          className={styles.filters}
        >
          {filters.map((filter) => (
            <Link
              className={`${styles.filterButton} ${
                activeStatus ===
                filter.value
                  ? styles.activeFilter
                  : ""
              }`}
              href={buildFilterHref({
                status: filter.value,
                query: searchQuery,
              })}
              key={filter.value}
            >
              {filter.label}

              <span>
                {filter.count}
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section
        className={styles.panel}
      >
        <div
          className={
            styles.panelHeader
          }
        >
          <div>
            <h2>
              Registro de suscripciones
            </h2>

            <p>
              Se muestran{" "}
              {
                filteredSubscriptions.length
              }{" "}
              suscripciones según los
              filtros seleccionados.
            </p>
          </div>
        </div>

        {filteredSubscriptions.length ===
        0 ? (
          <div
            className={
              styles.emptyState
            }
          >
            <div
              className={
                styles.emptyIcon
              }
            >
              +
            </div>

            <h3>
              No existen suscripciones
              para este filtro
            </h3>

            <p>
              Registra una nueva
              suscripción o modifica los
              filtros seleccionados.
            </p>

            <Link
              className={
                styles.primaryButton
              }
              href="/suscripciones/nuevo"
            >
              Crear suscripción
            </Link>
          </div>
        ) : (
          <div
            className={
              styles.tableWrapper
            }
          >
            <table
              className={styles.table}
            >
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Proyecto</th>
                  <th>Plan</th>
                  <th>Ciclo</th>
                  <th>Precio acordado</th>
                  <th>Solicitudes</th>
                  <th>Renovación</th>
                  <th>Registros</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredSubscriptions.map(
                  (subscription) => (
                    <tr
                      key={
                        subscription.id
                      }
                    >
                      <td>
                        <Link
                          className={
                            styles.clientLink
                          }
                          href={`/clientes/${subscription.clientId}`}
                        >
                          <strong>
                            {
                              subscription
                                .client
                                .businessName
                            }
                          </strong>

                          <span>
                            {subscription
                              .client
                              .email ??
                              "Sin correo"}
                          </span>
                        </Link>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.projectName
                          }
                        >
                          {subscription
                            .project
                            ?.domain ??
                            subscription
                              .project
                              ?.name ??
                            "Sin proyecto"}
                        </strong>
                      </td>

                      <td>
                        <div
                          className={
                            styles.planCell
                          }
                        >
                          <strong>
                            {
                              subscription
                                .plan.name
                            }
                          </strong>

                          <span>
                            {
                              subscription
                                .plan
                                .includedRequests
                            }{" "}
                            solicitudes
                            incluidas
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={
                            styles.cycleBadge
                          }
                        >
                          {getCycleLabel(
                            subscription.billingCycle,
                          )}
                        </span>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.price
                          }
                        >
                          {formatCurrency(
                            subscription.agreedPrice,
                          )}
                        </strong>

                        <span
                          className={
                            styles.secondaryText
                          }
                        >
                          Neto{" "}
                          {getCycleDescription(
                            subscription.billingCycle,
                          )}
                        </span>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.usage
                          }
                        >
                          {
                            subscription.requestsUsed
                          }
                          /
                          {
                            subscription
                              .plan
                              .includedRequests
                          }
                        </strong>

                        <span
                          className={
                            styles.secondaryText
                          }
                        >
                          Utilizadas
                        </span>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.dateValue
                          }
                        >
                          {formatDate(
                            subscription.renewsAt,
                          )}
                        </strong>
                      </td>

                      <td>
                        <div
                          className={
                            styles.recordList
                          }
                        >
                          <span>
                            {
                              subscription
                                ._count
                                .renewals
                            }{" "}
                            renovaciones
                          </span>

                          <span>
                            {
                              subscription
                                ._count
                                .payments
                            }{" "}
                            pagos
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${getStatusClass(
                            subscription.status,
                          )}`}
                        >
                          {getStatusLabel(
                            subscription.status,
                          )}
                        </span>
                      </td>

                      <td>
                        <Link
                          className={
                            styles.editButton
                          }
                          href={`/suscripciones/${subscription.id}/editar`}
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        className={
          styles.informationBox
        }
      >
        Registrar o editar una suscripción
        no crea movimientos financieros. Los
        cobros y renovaciones se generarán
        posteriormente desde una acción
        separada y confirmada.
      </div>
    </main>
  );
}