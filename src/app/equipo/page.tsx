import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleTeamMemberStatus } from "./actions";
import styles from "./equipo.module.css";

type TeamPageProps = {
  searchParams: Promise<{
    resultado?: string;
    error?: string;
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Santiago",
    },
  ).format(date);
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    COLLABORATOR: "Colaborador",
  };

  return labels[role] ?? role;
}

function getResultMessage(
  result: string | undefined,
) {
  const messages: Record<string, string> = {
    creado:
      "El integrante fue registrado correctamente y ya puede asignarse a solicitudes.",
    activado:
      "El integrante fue activado correctamente.",
    desactivado:
      "El integrante fue desactivado correctamente.",
  };

  return result
    ? messages[result] ?? null
    : null;
}

export default async function TeamPage({
  searchParams,
}: TeamPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const users =
    await prisma.user.findMany({
      where: {
        role: {
          in: [
            "ADMIN",
            "COLLABORATOR",
          ],
        },
      },
      orderBy: [
        {
          active: "desc",
        },
        {
          name: "asc",
        },
      ],
      include: {
        _count: {
          select: {
            assignedRequests: true,
            createdRequests: true,
            activityLogs: true,
          },
        },
      },
    });

  const activeUsers = users.filter(
    (user) => user.active,
  );

  const administratorCount =
    activeUsers.filter(
      (user) =>
        user.role === "ADMIN",
    ).length;

  const collaboratorCount =
    activeUsers.filter(
      (user) =>
        user.role ===
        "COLLABORATOR",
    ).length;

  const assignedRequestCount =
    users.reduce(
      (total, user) =>
        total +
        user._count.assignedRequests,
      0,
    );

  const resultMessage =
    getResultMessage(
      resolvedSearchParams.resultado,
    );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Administración interna
          </span>

          <h1>Equipo</h1>

          <p>
            Administra los integrantes
            internos que pueden ser
            asignados como responsables
            de solicitudes y procesos
            operativos.
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
            href="/"
          >
            Volver al dashboard
          </Link>

          <Link
            className={
              styles.primaryButton
            }
            href="/equipo/nuevo"
          >
            Nuevo integrante
          </Link>
        </div>
      </header>

      {resultMessage && (
        <div
          className={
            styles.successMessage
          }
        >
          {resultMessage}
        </div>
      )}

      {resolvedSearchParams.error ===
        "ultimo-administrador" && (
        <div
          className={
            styles.warningMessage
          }
        >
          No se puede desactivar al
          último administrador activo.
          Registra o activa otro
          administrador antes de
          continuar.
        </div>
      )}

      <section
        className={styles.summary}
      >
        <article>
          <span>
            Integrantes registrados
          </span>

          <strong>
            {users.length}
          </strong>

          <p>
            Administradores y
            colaboradores
          </p>
        </article>

        <article>
          <span>
            Integrantes activos
          </span>

          <strong>
            {activeUsers.length}
          </strong>

          <p>
            Disponibles para asignación
          </p>
        </article>

        <article>
          <span>
            Administradores
          </span>

          <strong>
            {administratorCount}
          </strong>

          <p>
            Usuarios con control
            administrativo
          </p>
        </article>

        <article>
          <span>
            Solicitudes asignadas
          </span>

          <strong>
            {assignedRequestCount}
          </strong>

          <p>
            Requerimientos vinculados al
            equipo
          </p>
        </article>
      </section>

      <section className={styles.panel}>
        <div
          className={
            styles.panelHeader
          }
        >
          <div>
            <h2>
              Integrantes del equipo
            </h2>

            <p>
              Los usuarios activos
              aparecerán automáticamente
              en el selector de
              responsables de cada
              solicitud.
            </p>
          </div>
        </div>

        {users.length === 0 ? (
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
              Todavía no existen
              integrantes internos
            </h3>

            <p>
              Registra a Roberto como
              administrador para comenzar
              a asignar responsables a las
              solicitudes.
            </p>

            <Link
              className={
                styles.primaryButton
              }
              href="/equipo/nuevo"
            >
              Registrar administrador
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
                  <th>Integrante</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>
                    Solicitudes asignadas
                  </th>
                  <th>
                    Solicitudes creadas
                  </th>
                  <th>
                    Fecha de registro
                  </th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const toggleAction =
                    toggleTeamMemberStatus.bind(
                      null,
                      user.id,
                    );

                  return (
                    <tr key={user.id}>
                      <td>
                        <div
                          className={
                            styles.memberCell
                          }
                        >
                          <div
                            className={
                              styles.avatar
                            }
                          >
                            {user.name
                              .split(" ")
                              .slice(0, 2)
                              .map((part) =>
                                part
                                  .charAt(0)
                                  .toUpperCase(),
                              )
                              .join("")}
                          </div>

                          <div>
                            <strong>
                              {user.name}
                            </strong>

                            <span>
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`${styles.role} ${
                            user.role ===
                            "ADMIN"
                              ? styles.roleAdmin
                              : styles.roleCollaborator
                          }`}
                        >
                          {getRoleLabel(
                            user.role,
                          )}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            user.active
                              ? styles.statusActive
                              : styles.statusInactive
                          }`}
                        >
                          {user.active
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.metric
                          }
                        >
                          {
                            user._count
                              .assignedRequests
                          }
                        </strong>
                      </td>

                      <td>
                        <strong
                          className={
                            styles.metric
                          }
                        >
                          {
                            user._count
                              .createdRequests
                          }
                        </strong>
                      </td>

                      <td>
                        {formatDate(
                          user.createdAt,
                        )}
                      </td>

                      <td>
                        <form
                          action={
                            toggleAction
                          }
                        >
                          <button
                            className={
                              user.active
                                ? styles.deactivateButton
                                : styles.activateButton
                            }
                            type="submit"
                          >
                            {user.active
                              ? "Desactivar"
                              : "Activar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {collaboratorCount === 0 &&
        administratorCount > 0 && (
          <div
            className={
              styles.informationBox
            }
          >
            Actualmente solo hay
            administradores activos. Los
            colaboradores pueden
            incorporarse más adelante para
            recibir solicitudes específicas
            sin otorgarles el rol
            administrativo.
          </div>
        )}
    </main>
  );
}