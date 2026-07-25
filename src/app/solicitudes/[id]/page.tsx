import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addSupportComment,
  updateSupportRequest,
} from "../actions";
import styles from "../solicitudes.module.css";

type SupportRequestDetailPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    resultado?: string;
  }>;
};

function formatDate(
  date: Date | null | undefined,
) {
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

function formatDateTime(
  date: Date | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatDateInput(
  date: Date | null | undefined,
) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

function getAuthorTypeLabel(authorType: string) {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    COLLABORATOR: "Colaborador",
    CLIENT: "Cliente",
  };

  return labels[authorType] ?? authorType;
}

function getActivityLabel(action: string) {
  const labels: Record<string, string> = {
    SUPPORT_REQUEST_CREATED:
      "Solicitud creada",
    SUPPORT_REQUEST_UPDATED:
      "Solicitud actualizada",
    SUPPORT_COMMENT_CREATED:
      "Comentario agregado",
  };

  return labels[action] ?? "Actividad registrada";
}

export default async function SupportRequestDetailPage({
  params,
  searchParams,
}: SupportRequestDetailPageProps) {
  const { id } = await params;

  const resolvedSearchParams =
    await searchParams;

  const [request, availableUsers] =
    await Promise.all([
      prisma.supportRequest.findUnique({
        where: {
          id,
        },
        include: {
          client: true,
          project: true,
          assignedTo: true,
          comments: {
            orderBy: {
              createdAt: "desc",
            },
          },
          activityLogs: {
            orderBy: {
              createdAt: "desc",
            },
            take: 50,
            include: {
              user: true,
            },
          },
          _count: {
            select: {
              comments: true,
              attachments: true,
            },
          },
        },
      }),

      prisma.user.findMany({
        where: {
          active: true,
          role: {
            in: ["ADMIN", "COLLABORATOR"],
          },
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      }),
    ]);

  if (!request) {
    notFound();
  }

  const updateAction =
    updateSupportRequest.bind(
      null,
      request.id,
    );

  const commentAction =
    addSupportComment.bind(
      null,
      request.id,
    );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Solicitud #
            {request.number
              .toString()
              .padStart(4, "0")}
          </span>

          <h1>{request.subject}</h1>

          <p>
            Registrada el{" "}
            {formatDateTime(request.createdAt)} para{" "}
            {request.client.businessName}.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href="/solicitudes"
          >
            Volver a solicitudes
          </Link>

          <Link
            className={styles.secondaryButton}
            href={`/clientes/${request.clientId}`}
          >
            Ver cliente
          </Link>
        </div>
      </header>

      {resolvedSearchParams.resultado ===
        "actualizada" && (
        <div className={styles.successMessage}>
          La solicitud fue actualizada y el cambio quedó
          registrado en el historial.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "creada" && (
        <div className={styles.successMessage}>
          La solicitud fue creada correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "comentario" && (
        <div className={styles.successMessage}>
          El comentario fue agregado correctamente.
        </div>
      )}

      <section className={styles.summary}>
        <article>
          <span>Estado actual</span>

          <strong>
            <span
              className={`${styles.status} ${getStatusClass(
                request.status,
              )}`}
            >
              {getStatusLabel(request.status)}
            </span>
          </strong>

          <p>Situación operativa de la solicitud</p>
        </article>

        <article>
          <span>Prioridad</span>

          <strong>
            <span
              className={`${styles.priority} ${getPriorityClass(
                request.priority,
              )}`}
            >
              {getPriorityLabel(request.priority)}
            </span>
          </strong>

          <p>Nivel de atención requerido</p>
        </article>

        <article>
          <span>Responsable</span>

          <strong className={styles.summaryText}>
            {request.assignedTo?.name ??
              "Sin asignar"}
          </strong>

          <p>Persona encargada del requerimiento</p>
        </article>

        <article>
          <span>Actividad registrada</span>

          <strong>
            {request._count.comments +
              request._count.attachments}
          </strong>

          <p>
            {request._count.comments} comentarios y{" "}
            {request._count.attachments} archivos
          </p>
        </article>
      </section>

      <div className={styles.detailLayout}>
        <div className={styles.mainColumn}>
          <section className={styles.formPanel}>
            <section className={styles.formSection}>
              <div className={styles.sectionHeader}>
                <h2>Información de la solicitud</h2>

                <p>
                  Antecedentes entregados al momento de crear
                  el requerimiento.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoBlock}>
                  <span>Cliente</span>

                  <strong>
                    {request.client.businessName}
                  </strong>

                  <small>
                    {request.client.email ??
                      "Sin correo registrado"}
                  </small>
                </div>

                <div className={styles.infoBlock}>
                  <span>Proyecto asociado</span>

                  <strong>
                    {request.project?.domain ??
                      request.project?.name ??
                      "Sin proyecto asociado"}
                  </strong>

                  <small>
                    {request.project
                      ? request.project.name
                      : "Solicitud general del cliente"}
                  </small>
                </div>

                <div className={styles.infoBlock}>
                  <span>Fecha de registro</span>

                  <strong>
                    {formatDateTime(request.createdAt)}
                  </strong>
                </div>

                <div className={styles.infoBlock}>
                  <span>Entrega estimada</span>

                  <strong>
                    {formatDate(
                      request.estimatedDelivery,
                    )}
                  </strong>
                </div>
              </div>

              <div className={styles.descriptionBox}>
                <span>Descripción</span>

                <p>{request.description}</p>
              </div>
            </section>

            <form action={updateAction}>
              <section className={styles.formSection}>
                <div className={styles.sectionHeader}>
                  <h2>Gestión de la solicitud</h2>

                  <p>
                    Actualiza el estado, responsable,
                    prioridad, plazo y observaciones internas.
                  </p>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Estado *</span>

                    <select
                      defaultValue={request.status}
                      name="status"
                      required
                    >
                      <option value="RECEIVED">
                        Recibida
                      </option>

                      <option value="UNDER_REVIEW">
                        En revisión
                      </option>

                      <option value="WAITING_FOR_CLIENT">
                        Esperando cliente
                      </option>

                      <option value="APPROVED">
                        Aprobada
                      </option>

                      <option value="IN_PROGRESS">
                        En proceso
                      </option>

                      <option value="READY_FOR_REVIEW">
                        Lista para revisión
                      </option>

                      <option value="COMPLETED">
                        Completada
                      </option>

                      <option value="REJECTED">
                        Rechazada
                      </option>

                      <option value="OUT_OF_SCOPE">
                        Fuera de alcance
                      </option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Prioridad *</span>

                    <select
                      defaultValue={request.priority}
                      name="priority"
                      required
                    >
                      <option value="LOW">Baja</option>
                      <option value="NORMAL">
                        Normal
                      </option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">
                        Urgente
                      </option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Responsable</span>

                    <select
                      defaultValue={
                        request.assignedToId ?? ""
                      }
                      name="assignedToId"
                    >
                      <option value="">
                        Sin responsable asignado
                      </option>

                      {availableUsers.map((user) => (
                        <option
                          key={user.id}
                          value={user.id}
                        >
                          {user.name} ·{" "}
                          {user.role === "ADMIN"
                            ? "Administrador"
                            : "Colaborador"}
                        </option>
                      ))}
                    </select>

                    {availableUsers.length === 0 && (
                      <small>
                        Todavía no existen administradores o
                        colaboradores activos registrados.
                      </small>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span>Entrega estimada</span>

                    <input
                      defaultValue={formatDateInput(
                        request.estimatedDelivery,
                      )}
                      name="estimatedDelivery"
                      type="date"
                    />
                  </label>

                  <label
                    className={`${styles.field} ${styles.fullWidth}`}
                  >
                    <span>Notas internas</span>

                    <textarea
                      defaultValue={
                        request.internalNotes ?? ""
                      }
                      name="internalNotes"
                      placeholder="Avances, acuerdos, antecedentes técnicos o instrucciones internas."
                      rows={7}
                    />
                  </label>
                </div>
              </section>

              <footer className={styles.formFooter}>
                <Link
                  className={styles.secondaryButton}
                  href="/solicitudes"
                >
                  Cancelar
                </Link>

                <button
                  className={styles.primaryButton}
                  type="submit"
                >
                  Guardar cambios
                </button>
              </footer>
            </form>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Agregar comentario</h2>

                <p>
                  Registra avances, respuestas o antecedentes
                  relevantes.
                </p>
              </div>
            </div>

            <form
              action={commentAction}
              className={styles.commentForm}
            >
              <label className={styles.field}>
                <span>Autor</span>

                <input
                  defaultValue="Roberto Manzo"
                  name="authorName"
                  required
                  type="text"
                />
              </label>

              <label className={styles.field}>
                <span>Comentario *</span>

                <textarea
                  name="message"
                  placeholder="Escribe el avance o antecedente que debe quedar registrado."
                  required
                  rows={6}
                />
              </label>

              <label className={styles.checkboxField}>
                <input
                  defaultChecked
                  name="internal"
                  type="checkbox"
                />

                <span>
                  Comentario interno, visible solo para
                  Vialoop
                </span>
              </label>

              <button
                className={styles.primaryButton}
                type="submit"
              >
                Agregar comentario
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Comentarios</h2>

                <p>
                  {request.comments.length} registros asociados
                  a la solicitud.
                </p>
              </div>
            </div>

            {request.comments.length === 0 ? (
              <div className={styles.emptyCompact}>
                Todavía no existen comentarios registrados.
              </div>
            ) : (
              <div className={styles.commentsList}>
                {request.comments.map((comment) => (
                  <article
                    className={styles.commentItem}
                    key={comment.id}
                  >
                    <div className={styles.commentHeader}>
                      <div>
                        <strong>
                          {comment.authorName}
                        </strong>

                        <span>
                          {getAuthorTypeLabel(
                            comment.authorType,
                          )}
                        </span>
                      </div>

                      <span
                        className={
                          comment.internal
                            ? styles.commentInternal
                            : styles.commentVisible
                        }
                      >
                        {comment.internal
                          ? "Interno"
                          : "Visible"}
                      </span>
                    </div>

                    <p className={styles.commentMessage}>
                      {comment.message}
                    </p>

                    <time>
                      {formatDateTime(comment.createdAt)}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Historial de actividad</h2>

                <p>
                  Cambios y acciones registrados en orden
                  cronológico.
                </p>
              </div>
            </div>

            {request.activityLogs.length === 0 ? (
              <div className={styles.emptyCompact}>
                El historial comenzará con la próxima
                actualización o comentario.
              </div>
            ) : (
              <div className={styles.activityList}>
                {request.activityLogs.map((activity) => (
                  <article
                    className={styles.activityItem}
                    key={activity.id}
                  >
                    <div
                      className={styles.activityMarker}
                    />

                    <div className={styles.activityContent}>
                      <strong>
                        {getActivityLabel(activity.action)}
                      </strong>

                      <p>
                        {activity.description ??
                          "Actividad registrada en el sistema."}
                      </p>

                      <div className={styles.activityMeta}>
                        <span>
                          {activity.user?.name ??
                            "Portal Vialoop"}
                        </span>

                        <time>
                          {formatDateTime(
                            activity.createdAt,
                          )}
                        </time>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}