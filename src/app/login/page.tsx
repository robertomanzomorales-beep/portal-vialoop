import type { Metadata } from "next";
import { login } from "./actions";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    resultado?: string;
    next?: string;
  }>;
};

function getErrorMessage(
  error: string | undefined,
) {
  const messages: Record<
    string,
    string
  > = {
    campos:
      "Ingresa el correo y la contraseña.",
    credenciales:
      "El correo o la contraseña no son correctos, o la cuenta no tiene acceso activo.",
    "sesion-requerida":
      "Debes iniciar sesión para acceder al portal.",
    "sesion-invalida":
      "La sesión dejó de ser válida. Inicia sesión nuevamente.",
  };

  return error
    ? messages[error] ?? null
    : null;
}

function getSafeNextValue(
  value: string | undefined,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login")
  ) {
    return "/";
  }

  return value;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const errorMessage =
    getErrorMessage(
      resolvedSearchParams.error,
    );

  const next =
    getSafeNextValue(
      resolvedSearchParams.next,
    );

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            V
          </div>

          <div>
            <strong>
              Portal Vialoop
            </strong>

            <span>
              Gestión administrativa
            </span>
          </div>
        </div>

        <div className={styles.heading}>
          <span>
            Acceso privado
          </span>

          <h1>Iniciar sesión</h1>

          <p>
            Ingresa con tu cuenta interna
            para acceder a clientes,
            proyectos, renovaciones y pagos.
          </p>
        </div>

        {errorMessage && (
          <div
            className={
              styles.errorMessage
            }
          >
            {errorMessage}
          </div>
        )}

        {resolvedSearchParams.resultado ===
          "sesion-cerrada" && (
          <div
            className={
              styles.successMessage
            }
          >
            La sesión fue cerrada
            correctamente.
          </div>
        )}

        <form
          action={login}
          className={styles.form}
        >
          <input
            name="next"
            type="hidden"
            value={next}
          />

          <label className={styles.field}>
            <span>
              Correo electrónico
            </span>

            <input
              autoComplete="username"
              autoFocus
              name="email"
              placeholder="correo@vialoop.cl"
              required
              type="email"
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña</span>

            <input
              autoComplete="current-password"
              minLength={12}
              name="password"
              placeholder="Ingresa tu contraseña"
              required
              type="password"
            />
          </label>

          <button
            className={
              styles.submitButton
            }
            type="submit"
          >
            Ingresar al portal
          </button>
        </form>

        <p className={styles.securityText}>
          Plataforma interna de Vialoop.
          El acceso está limitado a usuarios
          autorizados.
        </p>
      </section>

      <aside className={styles.visual}>
        <div>
          <span>
            Portal administrativo
          </span>

          <h2>
            Toda la operación de Vialoop,
            en un solo lugar.
          </h2>

          <p>
            Control de clientes, proyectos,
            solicitudes, suscripciones,
            renovaciones y pagos.
          </p>
        </div>
      </aside>
    </main>
  );
}