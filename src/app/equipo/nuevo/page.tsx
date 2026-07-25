import Link from "next/link";
import { createTeamMember } from "../actions";
import styles from "../equipo.module.css";

type NewTeamMemberPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewTeamMemberPage({
  searchParams,
}: NewTeamMemberPageProps) {
  const resolvedSearchParams =
    await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Nuevo usuario interno
          </span>

          <h1>Registrar integrante</h1>

          <p>
            Crea un perfil interno para
            asignar responsabilidades,
            registrar actividad y gestionar
            solicitudes.
          </p>
        </div>

        <Link
          className={
            styles.secondaryButton
          }
          href="/equipo"
        >
          Volver al equipo
        </Link>
      </header>

      {resolvedSearchParams.error ===
        "correo-duplicado" && (
        <div
          className={
            styles.warningMessage
          }
        >
          Ya existe un usuario registrado
          con ese correo electrónico.
        </div>
      )}

      <form
        action={createTeamMember}
        className={styles.formPanel}
      >
        <section
          className={
            styles.formSection
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <h2>
              Información del integrante
            </h2>

            <p>
              Datos utilizados para
              identificar al responsable
              dentro del portal.
            </p>
          </div>

          <div
            className={
              styles.formGrid
            }
          >
            <label
              className={styles.field}
            >
              <span>Nombre completo *</span>

              <input
                defaultValue="Roberto Manzo"
                maxLength={120}
                name="name"
                placeholder="Nombre y apellido"
                required
                type="text"
              />
            </label>

            <label
              className={styles.field}
            >
              <span>
                Correo electrónico *
              </span>

              <input
                autoComplete="email"
                name="email"
                placeholder="correo@vialoop.cl"
                required
                type="email"
              />
            </label>

            <label
              className={styles.field}
            >
              <span>Rol interno *</span>

              <select
                defaultValue="ADMIN"
                name="role"
                required
              >
                <option value="ADMIN">
                  Administrador
                </option>

                <option value="COLLABORATOR">
                  Colaborador
                </option>
              </select>

              <small>
                El administrador gestiona el
                portal. El colaborador puede
                recibir y trabajar solicitudes.
              </small>
            </label>

            <div
              className={
                styles.registrationState
              }
            >
              <span>Estado inicial</span>

              <strong>Activo</strong>

              <small>
                El integrante quedará
                disponible inmediatamente en
                el selector de responsables.
              </small>
            </div>
          </div>
        </section>

        <section
          className={
            styles.securityNotice
          }
        >
          <strong>
            Acceso al portal
          </strong>

          <p>
            Esta etapa crea el perfil interno
            para asignación y seguimiento. El
            inicio de sesión con contraseña se
            implementará posteriormente junto
            con la autenticación del portal.
          </p>
        </section>

        <footer
          className={
            styles.formFooter
          }
        >
          <Link
            className={
              styles.secondaryButton
            }
            href="/equipo"
          >
            Cancelar
          </Link>

          <button
            className={
              styles.primaryButton
            }
            type="submit"
          >
            Guardar integrante
          </button>
        </footer>
      </form>
    </main>
  );
}