import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DeleteDocumentButton,
} from "./DocumentControls";
import styles from "./documentos.module.css";

type DocumentsPageProps = {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    acceso?: string;
    resultado?: string;
  }>;
};

const documentTypes = [
  "CONTRACT",
  "QUOTATION",
  "INVOICE",
  "PAYMENT_RECEIPT",
  "REPORT",
  "MANUAL",
  "LOGO",
  "TEXT",
  "IMAGE",
  "BACKUP",
  "TECHNICAL",
  "OTHER",
] as const;

type DocumentTypeFilter =
  | "todos"
  | (typeof documentTypes)[number];

type AccessFilter =
  | "todos"
  | "clientes"
  | "internos";

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

function formatFileSize(size: number | null) {
  if (size === null || size < 0) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSearchValue(
  value: string | null | undefined,
) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function getDocumentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    CONTRACT: "Contrato",
    QUOTATION: "Cotización",
    INVOICE: "Factura",
    PAYMENT_RECEIPT: "Comprobante de pago",
    REPORT: "Informe",
    MANUAL: "Manual",
    LOGO: "Logo",
    TEXT: "Texto",
    IMAGE: "Imagen",
    BACKUP: "Respaldo",
    TECHNICAL: "Documento técnico",
    OTHER: "Otro",
  };

  return labels[type] ?? type;
}

function getDocumentTypeClass(type: string) {
  if (
    [
      "CONTRACT",
      "QUOTATION",
    ].includes(type)
  ) {
    return styles.typeLegal;
  }

  if (
    [
      "INVOICE",
      "PAYMENT_RECEIPT",
    ].includes(type)
  ) {
    return styles.typeBilling;
  }

  if (
    [
      "REPORT",
      "MANUAL",
      "TECHNICAL",
      "BACKUP",
    ].includes(type)
  ) {
    return styles.typeTechnical;
  }

  if (
    [
      "LOGO",
      "TEXT",
      "IMAGE",
    ].includes(type)
  ) {
    return styles.typeContent;
  }

  return styles.typeOther;
}

function getFileNameFromUrl(fileUrl: string) {
  try {
    const url = new URL(fileUrl);

    if (
      url.hostname === "drive.google.com"
    ) {
      return "Archivo en Google Drive";
    }

    if (
      url.hostname.includes("dropbox.com")
    ) {
      return "Archivo en Dropbox";
    }

    if (
      url.hostname.includes("onedrive.live.com") ||
      url.hostname.includes(
        "sharepoint.com",
      )
    ) {
      return "Archivo en OneDrive";
    }

    const fileName = url.pathname.split("/").pop();

    return fileName
      ? decodeURIComponent(fileName)
      : "Archivo enlazado";
  } catch {
    const fileName = fileUrl
      .split(/[?#]/)[0]
      .split("/")
      .pop();

    return fileName || "Archivo enlazado";
  }
}

function buildFilterHref({
  type,
  access,
  query,
}: {
  type: DocumentTypeFilter;
  access: AccessFilter;
  query: string;
}) {
  const params = new URLSearchParams();

  if (type !== "todos") {
    params.set("tipo", type);
  }

  if (access !== "todos") {
    params.set("acceso", access);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();

  return search
    ? `/documentos?${search}`
    : "/documentos";
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  const resolvedSearchParams = await searchParams;

  const requestedType =
    resolvedSearchParams.tipo ?? "todos";

  const requestedAccess =
    resolvedSearchParams.acceso ?? "todos";

  const allowedTypeFilters: DocumentTypeFilter[] = [
    "todos",
    ...documentTypes,
  ];

  const allowedAccessFilters: AccessFilter[] = [
    "todos",
    "clientes",
    "internos",
  ];

  const activeType =
    allowedTypeFilters.includes(
      requestedType as DocumentTypeFilter,
    )
      ? (requestedType as DocumentTypeFilter)
      : "todos";

  const activeAccess =
    allowedAccessFilters.includes(
      requestedAccess as AccessFilter,
    )
      ? (requestedAccess as AccessFilter)
      : "todos";

  const searchQuery = normalizeSearchValue(
    resolvedSearchParams.q,
  );

  const [
    documents,
    clients,
    projects,
  ] = await Promise.all([
    prisma.document.findMany({
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.client.findMany({
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        email: true,
      },
    }),
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        domain: true,
      },
    }),
  ]);

  const clientsById = new Map(
    clients.map((client) => [
      client.id,
      client,
    ]),
  );

  const projectsById = new Map(
    projects.map((project) => [
      project.id,
      project,
    ]),
  );

  const documentRows = documents.map(
    (document) => ({
      ...document,
      client:
        clientsById.get(document.clientId) ??
        null,
      project: document.projectId
        ? projectsById.get(document.projectId) ??
          null
        : null,
    }),
  );

  const filteredDocuments = documentRows.filter(
    (document) => {
      const matchesType =
        activeType === "todos" ||
        document.type === activeType;

      const matchesAccess =
        activeAccess === "todos" ||
        (activeAccess === "clientes" &&
          document.visibleToClient) ||
        (activeAccess === "internos" &&
          !document.visibleToClient);

      const searchableValues = [
        document.name,
        document.description,
        document.fileUrl,
        document.client?.businessName,
        document.client?.tradeName,
        document.client?.email,
        document.project?.name,
        document.project?.domain,
        getDocumentTypeLabel(document.type),
      ];

      const matchesSearch =
        !searchQuery ||
        searchableValues.some((value) =>
          normalizeSearchValue(value).includes(
            searchQuery,
          ),
        );

      return (
        matchesType &&
        matchesAccess &&
        matchesSearch
      );
    },
  );

  const visibleCount = documents.filter(
    (document) => document.visibleToClient,
  ).length;

  const internalCount =
    documents.length - visibleCount;

  const lastThirtyDays = new Date();
  lastThirtyDays.setDate(
    lastThirtyDays.getDate() - 30,
  );

  const recentCount = documents.filter(
    (document) =>
      document.createdAt >= lastThirtyDays,
  ).length;

  const typeFilters: Array<{
    label: string;
    value: DocumentTypeFilter;
    count: number;
  }> = [
    {
      label: "Todos",
      value: "todos",
      count: documents.length,
    },
    ...documentTypes.map((type) => ({
      label: getDocumentTypeLabel(type),
      value: type,
      count: documents.filter(
        (document) => document.type === type,
      ).length,
    })),
  ];

  const accessFilters: Array<{
    label: string;
    value: AccessFilter;
    count: number;
  }> = [
    {
      label: "Todos los accesos",
      value: "todos",
      count: documents.length,
    },
    {
      label: "Visible para clientes",
      value: "clientes",
      count: visibleCount,
    },
    {
      label: "Solo uso interno",
      value: "internos",
      count: internalCount,
    },
  ];

  const resultMessages: Record<
    string,
    string
  > = {
    creado:
      "El documento fue registrado correctamente.",
    actualizado:
      "El documento fue actualizado correctamente.",
    eliminado:
      "El documento fue eliminado del Portal. El archivo original no fue borrado.",
  };

  const resultMessage =
    resolvedSearchParams.resultado
      ? resultMessages[
          resolvedSearchParams.resultado
        ]
      : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Gestión documental
          </span>

          <h1>Documentos</h1>

          <p>
            Centraliza contratos, cotizaciones,
            facturas, manuales y archivos asociados a
            cada cliente o proyecto.
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
            href="/documentos/nuevo"
          >
            Nuevo documento
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
          <span>Documentos registrados</span>
          <strong>{documents.length}</strong>
          <p>Total almacenado en el sistema</p>
        </article>

        <article>
          <span>Visibles para clientes</span>
          <strong>{visibleCount}</strong>
          <p>Disponibles para acceso externo</p>
        </article>

        <article>
          <span>Documentos internos</span>
          <strong>{internalCount}</strong>
          <p>Visibles únicamente para Vialoop</p>
        </article>

        <article>
          <span>Agregados recientemente</span>
          <strong>{recentCount}</strong>
          <p>Registrados durante los últimos 30 días</p>
        </article>
      </section>

      <section className={styles.controls}>
        <form
          className={styles.searchForm}
          method="get"
        >
          {activeType !== "todos" && (
            <input
              name="tipo"
              type="hidden"
              value={activeType}
            />
          )}

          {activeAccess !== "todos" && (
            <input
              name="acceso"
              type="hidden"
              value={activeAccess}
            />
          )}

          <label className={styles.searchField}>
            <span>Buscar documento</span>

            <div className={styles.searchRow}>
              <input
                defaultValue={
                  resolvedSearchParams.q ?? ""
                }
                name="q"
                placeholder="Nombre, cliente, proyecto, dominio o tipo"
                type="search"
              />

              <button type="submit">
                Buscar
              </button>

              {(searchQuery ||
                activeType !== "todos" ||
                activeAccess !== "todos") && (
                <Link href="/documentos">
                  Limpiar
                </Link>
              )}
            </div>
          </label>
        </form>

        <div className={styles.filterGroups}>
          <div>
            <span className={styles.filterLabel}>
              Tipo de documento
            </span>

            <nav
              aria-label="Filtros por tipo"
              className={styles.filters}
            >
              {typeFilters.map((filter) => (
                <Link
                  className={`${styles.filterButton} ${
                    activeType === filter.value
                      ? styles.activeFilter
                      : ""
                  }`}
                  href={buildFilterHref({
                    type: filter.value,
                    access: activeAccess,
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
              Acceso
            </span>

            <nav
              aria-label="Filtros por acceso"
              className={styles.filters}
            >
              {accessFilters.map((filter) => (
                <Link
                  className={`${styles.filterButton} ${
                    activeAccess === filter.value
                      ? styles.activeFilter
                      : ""
                  }`}
                  href={buildFilterHref({
                    type: activeType,
                    access: filter.value,
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
            <h2>Biblioteca de documentos</h2>

            <p>
              Se muestran {filteredDocuments.length} documentos
              según los filtros seleccionados.
            </p>
          </div>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              D
            </div>

            <h3>
              No existen documentos para este filtro
            </h3>

            <p>
              Registra un documento nuevo o cambia los
              filtros para revisar los demás archivos.
            </p>

            <Link
              className={styles.primaryButton}
              href="/documentos/nuevo"
            >
              Registrar documento
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Cliente / proyecto</th>
                  <th>Tipo</th>
                  <th>Acceso</th>
                  <th>Archivo</th>
                  <th>Registro</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredDocuments.map(
                  (document) => {
                    const fileSize = formatFileSize(
                      document.fileSize,
                    );

                    return (
                      <tr key={document.id}>
                        <td>
                          <strong
                            className={
                              styles.documentName
                            }
                          >
                            {document.name}
                          </strong>

                          <span
                            className={
                              styles.description
                            }
                          >
                            {document.description ??
                              "Sin descripción"}
                          </span>
                        </td>

                        <td>
                          <Link
                            className={
                              styles.clientLink
                            }
                            href={`/clientes/${document.clientId}`}
                          >
                            <strong>
                              {document.client
                                ?.businessName ??
                                "Cliente no disponible"}
                            </strong>

                            <span>
                              {document.project
                                ?.domain ??
                                document.project?.name ??
                                "Documento general del cliente"}
                            </span>
                          </Link>
                        </td>

                        <td>
                          <span
                            className={`${styles.typeBadge} ${getDocumentTypeClass(
                              document.type,
                            )}`}
                          >
                            {getDocumentTypeLabel(
                              document.type,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`${styles.visibilityBadge} ${
                              document.visibleToClient
                                ? styles.visibleClient
                                : styles.visibleInternal
                            }`}
                          >
                            {document.visibleToClient
                              ? "Visible para cliente"
                              : "Solo Vialoop"}
                          </span>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.fileName
                            }
                          >
                            {getFileNameFromUrl(
                              document.fileUrl,
                            )}
                          </strong>

                          <span
                            className={styles.fileMeta}
                          >
                            {[
                              document.mimeType,
                              fileSize,
                            ]
                              .filter(Boolean)
                              .join(" · ") ||
                              "Archivo enlazado"}
                          </span>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.dateValue
                            }
                          >
                            {formatDateTime(
                              document.createdAt,
                            )}
                          </strong>
                        </td>

                        <td>
                          <div
                            className={styles.actions}
                          >
                            <a
                              className={
                                styles.primaryButton
                              }
                              href={document.fileUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir archivo
                            </a>

                            <Link
                              className={
                                styles.viewButton
                              }
                              href={`/documentos/${document.id}/editar`}
                            >
                              Editar
                            </Link>

                            <DeleteDocumentButton
                              documentId={
                                document.id
                              }
                              documentName={
                                document.name
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
