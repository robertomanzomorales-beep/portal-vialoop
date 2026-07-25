import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updatePlan } from "../../actions";
import styles from "../../planes.module.css";

type EditPlanPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    resultado?: string;
    error?: string;
  }>;
};

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function EditPlanPage({
  params,
  searchParams,
}: EditPlanPageProps) {
  const { id } = await params;

  const resolvedSearchParams =
    await searchParams;

  const plan =
    await prisma.plan.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

  if (!plan) {
    notFound();
  }

  const action = updatePlan.bind(
    null,
    plan.id,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Edición de plan
          </span>

          <h1>{plan.name}</h1>

          <p>
            Actualiza las condiciones comerciales y la
            disponibilidad del plan.
          </p>
        </div>

        <Link
          className={styles.secondaryButton}
          href="/planes"
        >
          Volver a planes
        </Link>
      </header>

      {resolvedSearchParams.resultado ===
        "actualizado" && (
        <div className={styles.successMessage}>
          El plan fue actualizado correctamente.
        </div>
      )}

      {resolvedSearchParams.error ===
        "tipo-duplicado" && (
        <div className={styles.warningMessage}>
          Ya existe otro plan registrado con ese tipo.
          Selecciona un tipo diferente.
        </div>
      )}

      <section className={styles.detailBanner}>
        <div>
          <span>Precio mensual actual</span>

          <strong>
            {formatCurrency(
              Number(plan.monthlyPrice),
            )}
            <small> + IVA</small>
          </strong>
        </div>

        <div>
          <span>Suscripciones vinculadas</span>

          <strong>
            {plan._count.subscriptions}
          </strong>
        </div>

        <div>
          <span>Estado actual</span>

          <strong
            className={
              plan.active
                ? styles.activeText
                : styles.inactiveText
            }
          >
            {plan.active
              ? "Activo"
              : "Inactivo"}
          </strong>
        </div>
      </section>

      <form
        action={action}
        className={styles.formPanel}
      >
        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Información general</h2>

            <p>
              Modifica el nombre, tipo y condiciones comerciales
              del plan.
            </p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nombre del plan *</span>

              <input
                defaultValue={plan.name}
                maxLength={120}
                name="name"
                required
                type="text"
              />
            </label>

            <label className={styles.field}>
              <span>Tipo de plan *</span>

              <select
                defaultValue={plan.type}
                name="type"
                required
              >
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
                Solo puede existir un plan registrado por cada
                tipo.
              </small>
            </label>

            <label className={styles.field}>
              <span>Precio mensual neto *</span>

              <input
                defaultValue={Math.round(
                  Number(plan.monthlyPrice),
                )}
                inputMode="numeric"
                min="1"
                name="monthlyPrice"
                required
                step="1"
                type="number"
              />

              <small>
                Valor mensual sin IVA.
              </small>
            </label>

            <label className={styles.field}>
              <span>Solicitudes incluidas *</span>

              <input
                defaultValue={
                  plan.includedRequests
                }
                inputMode="numeric"
                min="0"
                name="includedRequests"
                required
                step="1"
                type="number"
              />
            </label>

            <label className={styles.field}>
              <span>Tiempo de respuesta</span>

              <input
                defaultValue={
                  plan.responseHours ?? ""
                }
                inputMode="numeric"
                min="1"
                name="responseHours"
                step="1"
                type="number"
              />

              <small>
                Horas estimadas para la primera respuesta.
              </small>
            </label>

            <label
              className={`${styles.field} ${styles.fullWidth}`}
            >
              <span>Descripción</span>

              <textarea
                defaultValue={
                  plan.description ?? ""
                }
                maxLength={1000}
                name="description"
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Disponibilidad</h2>

            <p>
              Controla si el plan puede utilizarse en nuevas
              suscripciones.
            </p>
          </div>

          <label className={styles.switchCard}>
            <div className={styles.switchText}>
              <strong>Plan activo</strong>

              <span>
                Desactivarlo no elimina las{" "}
                {plan._count.subscriptions} suscripciones
                actualmente vinculadas.
              </span>
            </div>

            <span className={styles.switch}>
              <input
                defaultChecked={plan.active}
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
            Guardar cambios
          </button>
        </footer>
      </form>
    </main>
  );
}