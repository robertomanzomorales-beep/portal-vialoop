import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSupportRequest } from "../actions";
import styles from "../solicitudes.module.css";

type SupportRequestDetailPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    resultado?: string;
  }>;
};

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

function formatDateInput(
  date: Date | null | undefined,
) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

export default async function SupportRequestDetailPage({
  params,
  searchParams,
}: SupportRequestDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const request =
    await prisma.supportRequest.findUnique({
      where: {
        id,
      },
      include: {
        client: true,
        project: true,
        assignedTo: true,
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });

  if (!request) {
    notFound();
  }

  const action = updateSupportRequest.bind(
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
          La solicitud fue actualizada correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado === "creada" && (
        <div className={styles.successMessage}>
          La solicitud fue creada correctamente.
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
          <span>Entrega estimada</span>

          <strong>
            {formatDate(request.estimatedDelivery)}
          </strong>

          <p>Fecha comprometida para revisión</p>
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

      <section className={styles.formPanel}>
        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Información de la solicitud</h2>

            <p>
              Antecedentes entregados al momento de crear el
              requerimiento.
            </p>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <span>Cliente</span>

              <strong>
                {request.client.businessName}
              </strong>

              <small>
                {request.client.email ??
                  "Sin correo registrado"}
              </small>
            </div>

            <div className={styles.field}>
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

            <div className={styles.field}>
              <span>Responsable</span>

              <strong>
                {request.assignedTo?.name ??
                  "Sin responsable asignado"}
              </strong>
            </div>

            <div className={styles.field}>
              <span>Fecha de registro</span>

              <strong>
                {formatDateTime(request.createdAt)}
              </strong>
            </div>

            <div
              className={`${styles.field} ${styles.fullWidth}`}
            >
              <span>Descripción</span>

              <p>{request.description}</p>
            </div>
          </div>
        </section>

        <form action={action}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <h2>Gestión de la solicitud</h2>

              <p>
                Actualiza el estado, prioridad, plazo y
                observaciones internas del requerimiento.
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
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">
                    Urgente
                  </option>
                </select>
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

              <div className={styles.field}>
                <span>Responsable actual</span>

                <input
                  disabled
                  type="text"
                  value={
                    request.assignedTo?.name ??
                    "Sin responsable asignado"
                  }
                />

                <small>
                  La asignación de responsables se incorporará
                  en la siguiente etapa.
                </small>
              </div>

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
    </main>
  );
}