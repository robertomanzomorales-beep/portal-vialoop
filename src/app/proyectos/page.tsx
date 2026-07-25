import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./proyectos.module.css";

type ProjectsPageProps = {
  searchParams: Promise<{
    estado?: string;
    q?: string;
  }>;
};

type ProjectFilter =
  | "todos"
  | "activos"
  | "desarrollo"
  | "mantencion"
  | "suspendidos"
  | "finalizados";

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

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DEVELOPMENT: "En desarrollo",
    ACTIVE: "Activo",
    MAINTENANCE: "Mantención",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  };

  return labels[status] ?? status;
}

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    DEVELOPMENT: styles.statusDevelopment,
    ACTIVE: styles.statusActive,
    MAINTENANCE: styles.statusMaintenance,
    SUSPENDED: styles.statusSuspended,
    FINISHED: styles.statusFinished,
  };

  return classes[status] ?? styles.statusFinished;
}

function isActiveProject(status: string) {
  return ["DEVELOPMENT", "ACTIVE", "MAINTENANCE"].includes(status);
}

function matchesFilter(status: string, filter: ProjectFilter) {
  if (filter === "todos") {
    return true;
  }

  if (filter === "activos") {
    return isActiveProject(status);
  }

  if (filter === "desarrollo") {
    return status === "DEVELOPMENT";
  }

  if (filter === "mantencion") {
    return status === "MAINTENANCE";
  }

  if (filter === "suspendidos") {
    return status === "SUSPENDED";
  }

  if (filter === "finalizados") {
    return status === "FINISHED";
  }

  return true;
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function matchesSearch(
  project: {
    name: string;
    domain: string | null;
    websiteUrl: string | null;
    websiteType: string | null;
    hostingProvider: string | null;
    hostingCapacity: string | null;
    client: {
      businessName: string;
      tradeName: string | null;
      email: string | null;
    };
  },
  query: string,
) {
  if (!query) {
    return true;
  }

  const searchableValues = [
    project.name,
    project.domain,
    project.websiteUrl,
    project.websiteType,
    project.hostingProvider,
    project.hostingCapacity,
    project.client.businessName,
    project.client.tradeName,
    project.client.email,
  ];

  return searchableValues.some((value) =>
    normalizeSearchValue(value).includes(query),
  );
}

function getExternalUrl(value: string) {
  const normalizedValue = value.trim();

  if (
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://")
  ) {
    return normalizedValue;
  }

  return `https://${normalizedValue}`;
}

function buildFilterHref(filter: ProjectFilter, query: string) {
  const params = new URLSearchParams();

  if (filter !== "todos") {
    params.set("estado", filter);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();

  return search ? `/proyectos?${search}` : "/proyectos";
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const resolvedSearchParams = await searchParams;

  const allowedFilters: ProjectFilter[] = [
    "todos",
    "activos",
    "desarrollo",
    "mantencion",
    "suspendidos",
    "finalizados",
  ];

  const requestedFilter = resolvedSearchParams.estado ?? "todos";

  const activeFilter = allowedFilters.includes(
    requestedFilter as ProjectFilter,
  )
    ? (requestedFilter as ProjectFilter)
    : "todos";

  const searchQuery = normalizeSearchValue(resolvedSearchParams.q);

  const projects = await prisma.project.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      client: true,
      _count: {
        select: {
          supportRequests: true,
          documents: true,
          renewals: true,
        },
      },
    },
  });

  const filteredProjects = projects.filter(
    (project) =>
      matchesFilter(project.status, activeFilter) &&
      matchesSearch(project, searchQuery),
  );

  const activeCount = projects.filter((project) =>
    isActiveProject(project.status),
  ).length;

  const developmentCount = projects.filter(
    (project) => project.status === "DEVELOPMENT",
  ).length;

  const maintenanceCount = projects.filter(
    (project) => project.status === "MAINTENANCE",
  ).length;

  const suspendedCount = projects.filter(
    (project) => project.status === "SUSPENDED",
  ).length;

  const finishedCount = projects.filter(
    (project) => project.status === "FINISHED",
  ).length;

  const filters: Array<{
    label: string;
    value: ProjectFilter;
    count: number;
  }> = [
    {
      label: "Todos",
      value: "todos",
      count: projects.length,
    },
    {
      label: "Activos",
      value: "activos",
      count: activeCount,
    },
    {
      label: "En desarrollo",
      value: "desarrollo",
      count: developmentCount,
    },
    {
      label: "Mantención",
      value: "mantencion",
      count: maintenanceCount,
    },
    {
      label: "Suspendidos",
      value: "suspendidos",
      count: suspendedCount,
    },
    {
      label: "Finalizados",
      value: "finalizados",
      count: finishedCount,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Gestión operativa</span>

          <h1>Proyectos</h1>

          <p>
            Revisa los sitios web, dominios, servicios de hosting y proyectos
            asociados a cada cliente de Vialoop.
          </p>
        </div>

        <Link className={styles.secondaryButton} href="/">
          Volver al dashboard
        </Link>
      </header>

      <section className={styles.summary}>
        <article>
          <span>Proyectos registrados</span>
          <strong>{projects.length}</strong>
          <p>Total almacenado en el sistema</p>
        </article>

        <article>
          <span>Proyectos activos</span>
          <strong>{activeCount}</strong>
          <p>En desarrollo, activos o en mantención</p>
        </article>

        <article>
          <span>Hosting administrado</span>

          <strong>
            {
              projects.filter(
                (project) =>
                  project.hostingCapacity ||
                  project.hostingProvider ||
                  project.hostingRenewalDate,
              ).length
            }
          </strong>

          <p>Proyectos con información de hosting</p>
        </article>

        <article
          className={
            suspendedCount > 0
              ? styles.alertCard
              : undefined
          }
        >
          <span>Proyectos suspendidos</span>
          <strong>{suspendedCount}</strong>
          <p>Requieren revisión administrativa</p>
        </article>
      </section>

      <section className={styles.controls}>
        <form className={styles.searchForm} method="get">
          {activeFilter !== "todos" && (
            <input
              name="estado"
              type="hidden"
              value={activeFilter}
            />
          )}

          <label className={styles.searchField}>
            <span>Buscar proyecto</span>

            <div className={styles.searchRow}>
              <input
                defaultValue={resolvedSearchParams.q ?? ""}
                name="q"
                placeholder="Cliente, dominio, proyecto o correo"
                type="search"
              />

              <button type="submit">
                Buscar
              </button>

              {(searchQuery || activeFilter !== "todos") && (
                <Link href="/proyectos">
                  Limpiar
                </Link>
              )}
            </div>
          </label>
        </form>

        <nav
          aria-label="Filtros de proyectos"
          className={styles.filters}
        >
          {filters.map((filter) => (
            <Link
              className={`${styles.filterButton} ${
                activeFilter === filter.value
                  ? styles.activeFilter
                  : ""
              }`}
              href={buildFilterHref(filter.value, searchQuery)}
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
            <h2>Directorio de proyectos</h2>

            <p>
              Se muestran {filteredProjects.length} proyectos según los
              filtros seleccionados.
            </p>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⌕</div>

            <h3>No se encontraron proyectos</h3>

            <p>
              Prueba con otro término de búsqueda o selecciona un estado
              diferente.
            </p>

            <Link className={styles.secondaryButton} href="/proyectos">
              Ver todos los proyectos
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente / proyecto</th>
                  <th>Dominio</th>
                  <th>Tipo</th>
                  <th>Hosting</th>
                  <th>Renovación</th>
                  <th>Registros</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredProjects.map((project) => {
                  const websiteReference =
                    project.websiteUrl ?? project.domain;

                  return (
                    <tr key={project.id}>
                      <td>
                        <Link
                          className={styles.clientLink}
                          href={`/clientes/${project.clientId}`}
                        >
                          <strong>
                            {project.client.businessName}
                          </strong>

                          <span>{project.name}</span>
                        </Link>
                      </td>

                      <td>
                        {websiteReference ? (
                          <a
                            className={styles.domainLink}
                            href={getExternalUrl(websiteReference)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {project.domain ??
                              project.websiteUrl}
                          </a>
                        ) : (
                          <span className={styles.mutedText}>
                            Sin dominio
                          </span>
                        )}

                        {project.websiteUrl &&
                          project.domain && (
                            <span
                              className={
                                styles.secondaryText
                              }
                            >
                              {project.websiteUrl}
                            </span>
                          )}
                      </td>

                      <td>
                        <strong className={styles.typeName}>
                          {project.websiteType ??
                            "Sitio web"}
                        </strong>

                        <span className={styles.secondaryText}>
                          {project.technology ??
                            "Tecnología sin registrar"}
                        </span>
                      </td>

                      <td>
                        <strong className={styles.hostingValue}>
                          {project.hostingCapacity ??
                            "Sin capacidad"}
                        </strong>

                        <span className={styles.secondaryText}>
                          {project.hostingProvider ??
                            "Proveedor sin registrar"}
                        </span>
                      </td>

                      <td>
                        <strong className={styles.dateValue}>
                          {formatDate(
                            project.hostingRenewalDate,
                          )}
                        </strong>

                        {project.domainRenewalDate && (
                          <span className={styles.secondaryText}>
                            Dominio:{" "}
                            {formatDate(
                              project.domainRenewalDate,
                            )}
                          </span>
                        )}
                      </td>

                      <td>
                        <div className={styles.recordList}>
                          <span>
                            {
                              project._count
                                .renewals
                            }{" "}
                            renovaciones
                          </span>

                          <span>
                            {
                              project._count
                                .supportRequests
                            }{" "}
                            solicitudes
                          </span>

                          <span>
                            {
                              project._count
                                .documents
                            }{" "}
                            documentos
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${getStatusClass(
                            project.status,
                          )}`}
                        >
                          {getStatusLabel(
                            project.status,
                          )}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          {websiteReference && (
                            <a
                              className={styles.viewButton}
                              href={getExternalUrl(
                                websiteReference,
                              )}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir sitio
                            </a>
                          )}

                          <Link
                            className={styles.viewButton}
                            href={`/clientes/${project.clientId}`}
                          >
                            Ver cliente
                          </Link>

                          <Link
                            className={styles.viewButton}
                            href={`/clientes/${project.clientId}/editar`}
                          >
                            Editar
                          </Link>
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
    </main>
  );
}