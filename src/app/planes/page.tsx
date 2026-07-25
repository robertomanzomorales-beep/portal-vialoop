import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { togglePlanStatus } from "./actions";
import styles from "./planes.module.css";

type PlansPageProps = {
  searchParams: Promise<{
    estado?: string;
    q?: string;
    resultado?: string;
  }>;
};

type StatusFilter =
  | "todos"
  | "activos"
  | "inactivos";

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    ESSENTIAL: "Esencial",
    MANAGEMENT: "Gestión",
    ACTIVE: "Activo",
    CUSTOM: "Personalizado",
  };

  return labels[type] ?? type;
}

function getTypeClass(type: string) {
  const classes: Record<string, string> = {
    ESSENTIAL: styles.typeEssential,
    MANAGEMENT: styles.typeManagement,
    ACTIVE: styles.typeActive,
    CUSTOM: styles.typeCustom,
  };

  return classes[type] ?? styles.typeCustom;
}

function normalizeSearch(
  value: string | null | undefined,
) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function buildFilterHref({
  status,
  query,
}: {
  status: StatusFilter;
  query: string;
}) {
  const params = new URLSearchParams();

  if (status !== "todos") {
    params.set("estado", status);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();

  return search
    ? `/planes?${search}`
    : "/planes";
}

function getResultMessage(
  result: string | undefined,
) {
  const messages: Record<string, string> = {
    creado:
      "El plan fue creado correctamente.",
    activado:
      "El plan fue activado correctamente.",
    desactivado:
      "El plan fue desactivado correctamente. Las suscripciones existentes no fueron eliminadas.",
  };

  return result
    ? messages[result] ?? null
    : null;
}

export default async function PlansPage({
  searchParams,
}: PlansPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const allowedStatuses: StatusFilter[] = [
    "todos",
    "activos",
    "inactivos",
  ];

  const requestedStatus =
    resolvedSearchParams.estado ?? "todos";

  const activeStatus =
    allowedStatuses.includes(
      requestedStatus as StatusFilter,
    )
      ? (requestedStatus as StatusFilter)
      : "todos";

  const searchQuery = normalizeSearch(
    resolvedSearchParams.q,
  );

  const plans =
    await prisma.plan.findMany({
      orderBy: [
        {
          active: "desc",
        },
        {
          monthlyPrice: "asc",
        },
      ],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

  const filteredPlans = plans.filter(
    (plan) => {
      const matchesStatus =
        activeStatus === "todos" ||
        (activeStatus === "activos" &&
          plan.active) ||
        (activeStatus === "inactivos" &&
          !plan.active);

      const values = [
        plan.name,
        getTypeLabel(plan.type),
        plan.description,
      ];

      const matchesSearch =
        !searchQuery ||
        values.some((value) =>
          normalizeSearch(value).includes(
            searchQuery,
          ),
        );

      return (
        matchesStatus &&
        matchesSearch
      );
    },
  );

  const activePlans = plans.filter(
    (plan) => plan.active,
  );

  const activeCount =
    activePlans.length;

  const inactiveCount =
    plans.length - activeCount;

  const subscriptionCount =
    plans.reduce(
      (total, plan) =>
        total +
        plan._count.subscriptions,
      0,
    );

  const averagePrice =
    activePlans.length > 0
      ? Math.round(
          activePlans.reduce(
            (total, plan) =>
              total +
              Number(
                plan.monthlyPrice,
              ),
            0,
          ) / activePlans.length,
        )
      : 0;

  const resultMessage =
    getResultMessage(
      resolvedSearchParams.resultado,
    );

  const filters: Array<{
    label: string;
    value: StatusFilter;
    count: number;
  }> = [
    {
      label: "Todos",
      value: "todos",
      count: plans.length,
    },
    {
      label: "Activos",
      value: "activos",
      count: activeCount,
    },
    {
      label: "Inactivos",
      value: "inactivos",
      count: inactiveCount,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Administración comercial
          </span>

          <h1>Planes</h1>

          <p>
            Administra precios, solicitudes incluidas,
            tiempos de respuesta y disponibilidad de los
            planes comerciales de Vialoop.
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
            href="/planes/nuevo"
          >
            Nuevo plan
          </Link>
        </div>
      </header>

      {resultMessage && (
        <div className={styles.successMessage}>
          {resultMessage}
        </div>
      )}

      <section className={styles.summary}>
        <article>
          <span>Planes registrados</span>

          <strong>{plans.length}</strong>

          <p>Total almacenado en el sistema</p>
        </article>

        <article>
          <span>Planes activos</span>

          <strong>{activeCount}</strong>

          <p>Disponibles comercialmente</p>
        </article>

        <article>
          <span>Suscripciones vinculadas</span>

          <strong>{subscriptionCount}</strong>

          <p>Servicios asociados a los planes</p>
        </article>

        <article>
          <span>Precio mensual promedio</span>

          <strong className={styles.amount}>
            {formatCurrency(averagePrice)}
          </strong>

          <p>Valor neto promedio de planes activos</p>
        </article>
      </section>

      <section className={styles.controls}>
        <form
          className={styles.searchForm}
          method="get"
        >
          {activeStatus !== "todos" && (
            <input
              name="estado"
              type="hidden"
              value={activeStatus}
            />
          )}

          <label className={styles.searchField}>
            <span>Buscar plan</span>

            <div className={styles.searchRow}>
              <input
                defaultValue={
                  resolvedSearchParams.q ?? ""
                }
                name="q"
                placeholder="Nombre, tipo o descripción"
                type="search"
              />

              <button type="submit">
                Buscar
              </button>

              {(searchQuery ||
                activeStatus !== "todos") && (
                <Link href="/planes">
                  Limpiar
                </Link>
              )}
            </div>
          </label>
        </form>

        <nav
          aria-label="Filtros de planes"
          className={styles.filters}
        >
          {filters.map((filter) => (
            <Link
              className={`${styles.filterButton} ${
                activeStatus === filter.value
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

              <span>{filter.count}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Planes comerciales</h2>

            <p>
              Se muestran {filteredPlans.length} planes
              según los filtros seleccionados.
            </p>
          </div>
        </div>

        {filteredPlans.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>+</div>

            <h3>
              No existen planes para este filtro
            </h3>

            <p>
              Crea un nuevo plan o modifica los filtros para
              revisar los demás registros.
            </p>

            <Link
              className={styles.primaryButton}
              href="/planes/nuevo"
            >
              Crear plan
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Tipo</th>
                  <th>Precio mensual</th>
                  <th>Solicitudes</th>
                  <th>Respuesta</th>
                  <th>Suscripciones</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredPlans.map((plan) => {
                  const toggleAction =
                    togglePlanStatus.bind(
                      null,
                      plan.id,
                    );

                  return (
                    <tr key={plan.id}>
                      <td>
                        <div className={styles.planCell}>
                          <strong>{plan.name}</strong>

                          <span>
                            {plan.description ??
                              "Sin descripción registrada"}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`${styles.typeBadge} ${getTypeClass(
                            plan.type,
                          )}`}
                        >
                          {getTypeLabel(plan.type)}
                        </span>
                      </td>

                      <td>
                        <strong className={styles.price}>
                          {formatCurrency(
                            Number(
                              plan.monthlyPrice,
                            ),
                          )}
                        </strong>

                        <span className={styles.priceTax}>
                          + IVA
                        </span>
                      </td>

                      <td>
                        <strong
                          className={styles.metricValue}
                        >
                          {plan.includedRequests}
                        </strong>

                        <span
                          className={styles.secondaryText}
                        >
                          {plan.includedRequests === 0
                            ? "Cotizadas por separado"
                            : "Incluidas por periodo"}
                        </span>
                      </td>

                      <td>
                        <strong
                          className={styles.metricValue}
                        >
                          {plan.responseHours
                            ? `${plan.responseHours} h`
                            : "Sin definir"}
                        </strong>
                      </td>

                      <td>
                        <strong
                          className={styles.metricValue}
                        >
                          {
                            plan._count
                              .subscriptions
                          }
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            plan.active
                              ? styles.statusActive
                              : styles.statusInactive
                          }`}
                        >
                          {plan.active
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link
                            className={styles.editButton}
                            href={`/planes/${plan.id}/editar`}
                          >
                            Editar
                          </Link>

                          <form action={toggleAction}>
                            <button
                              className={
                                plan.active
                                  ? styles.deactivateButton
                                  : styles.activateButton
                              }
                              type="submit"
                            >
                              {plan.active
                                ? "Desactivar"
                                : "Activar"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.informationBox}>
        Desactivar un plan impide utilizarlo en nuevas
        operaciones comerciales, pero no elimina ni cancela las
        suscripciones que ya estén asociadas.
      </div>
    </main>
  );
}