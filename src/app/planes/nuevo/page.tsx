import Link from "next/link";
import { createPlan } from "../actions";
import styles from "../planes.module.css";

type NewPlanPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewPlanPage({
  searchParams,
}: NewPlanPageProps) {
  const resolvedSearchParams =
    await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Nuevo plan comercial
          </span>

          <h1>Crear plan</h1>

          <p>
            Registra el precio, nivel de servicio y condiciones
            generales de un nuevo plan de Vialoop.
          </p>
        </div>

        <Link
          className={styles.secondaryButton}
          href="/planes"
        >
          Volver a planes
        </Link>
      </header>

      {resolvedSearchParams.error ===
        "tipo-duplicado" && (
        <div className={styles.warningMessage}>
          Ya existe un plan registrado con ese tipo. Edita el
          plan existente o selecciona otro tipo disponible.
        </div>
      )}

      <form
        action={createPlan}
        className={styles.formPanel}
      >
        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Información general</h2>

            <p>
              Datos utilizados para identificar y presentar el
              plan.
            </p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nombre del plan *</span>

              <input
                maxLength={120}
                name="name"
                placeholder="Ej. Plan Esencial"
                required
                type="text"
              />
            </label>

            <label className={styles.field}>
              <span>Tipo de plan *</span>

              <select
                defaultValue=""
                name="type"
                required
              >
                <option disabled value="">
                  Seleccionar tipo
                </option>

                <option value="ESSENTIAL">
                  Esencial
                </option>

                <option value="MANAGEMENT">
                  Gestión
                </option>

                <option value="ACTIVE">
                  Activo
                </option>

                <option value="CUSTOM">
                  Personalizado
                </option>
              </select>

              <small>
                El sistema permite un único plan por cada tipo.
              </small>
            </label>

            <label className={styles.field}>
              <span>Precio mensual neto *</span>

              <input
                inputMode="numeric"
                min="1"
                name="monthlyPrice"
                placeholder="19990"
                required
                step="1"
                type="number"
              />

              <small>
                Ingresa el valor sin IVA y sin separadores de
                miles.
              </small>
            </label>

            <label className={styles.field}>
              <span>Solicitudes incluidas *</span>

              <input
                defaultValue="0"
                inputMode="numeric"
                min="0"
                name="includedRequests"
                required
                step="1"
                type="number"
              />

              <small>
                Utiliza cero cuando las solicitudes se coticen
                por separado.
              </small>
            </label>

            <label className={styles.field}>
              <span>Tiempo de respuesta</span>

              <input
                inputMode="numeric"
                min="1"
                name="responseHours"
                placeholder="24"
                step="1"
                type="number"
              />

              <small>
                Cantidad estimada de horas para entregar la
                primera respuesta.
              </small>
            </label>

            <label
              className={`${styles.field} ${styles.fullWidth}`}
            >
              <span>Descripción</span>

              <textarea
                maxLength={1000}
                name="description"
                placeholder="Resume el alcance, beneficios y condiciones generales del plan."
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Disponibilidad</h2>

            <p>
              Define si el plan estará disponible inmediatamente
              en el portal.
            </p>
          </div>

          <label className={styles.switchCard}>
            <div className={styles.switchText}>
              <strong>Plan activo</strong>

              <span>
                El plan podrá utilizarse en nuevas suscripciones
                y aparecerá en el dashboard.
              </span>
            </div>

            <span className={styles.switch}>
              <input
                defaultChecked
                name="active"
                type="checkbox"
              />

              <span className={styles.switchSlider} />
            </span>
          </label>
        </section>

        <footer className={styles.formFooter}>
          <Link
            className={styles.secondaryButton}
            href="/planes"
          >
            Cancelar
          </Link>

          <button
            className={styles.primaryButton}
            type="submit"
          >
            Guardar plan
          </button>
        </footer>
      </form>
    </main>
  );
}