import Link from "next/link";
import styles from "./resultado.module.css";

type PaymentResultPageProps = {
  searchParams: Promise<{
    estado?: string;
    orden?: string;
  }>;
};

type ResultContent = {
  eyebrow: string;
  title: string;
  description: string;
  statusClass: string;
};

function getResultContent(
  state: string,
): ResultContent {
  const results: Record<
    string,
    ResultContent
  > = {
    pagado: {
      eyebrow:
        "Pago confirmado",

      title:
        "El pago fue recibido correctamente",

      description:
        "La operación fue confirmada por Flow. El servicio quedó registrado como pagado y el próximo vencimiento fue generado automáticamente.",

      statusClass:
        styles.success,
    },

    pendiente: {
      eyebrow:
        "Pago en proceso",

      title:
        "La operación continúa pendiente",

      description:
        "Flow todavía no ha confirmado el pago. Algunos medios de pago pueden tardar más tiempo en procesarse. No es necesario realizar nuevamente la operación.",

      statusClass:
        styles.pending,
    },

    rechazado: {
      eyebrow:
        "Pago rechazado",

      title:
        "La operación no pudo completarse",

      description:
        "Flow informó que el pago fue rechazado. Puedes volver a solicitar un enlace de pago o comunicarte con Vialoop para recibir asistencia.",

      statusClass:
        styles.error,
    },

    anulado: {
      eyebrow:
        "Operación anulada",

      title:
        "El pago fue anulado",

      description:
        "La operación no fue completada. El cobro continúa pendiente y podrás realizar un nuevo intento de pago.",

      statusClass:
        styles.error,
    },

    error: {
      eyebrow:
        "No fue posible verificar",

      title:
        "No pudimos confirmar el estado del pago",

      description:
        "La operación será revisada automáticamente. Si realizaste el pago, no vuelvas a pagarlo antes de comunicarte con Vialoop.",

      statusClass:
        styles.error,
    },
  };

  return (
    results[state] ??
    results.error
  );
}

export default async function PaymentResultPage({
  searchParams,
}: PaymentResultPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const state =
    resolvedSearchParams.estado ??
    "error";

  const order =
    resolvedSearchParams.orden ??
    "";

  const content =
    getResultContent(
      state,
    );

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.card
        }
      >
        <div
          className={
            styles.brand
          }
        >
          <strong>
            Vialoop Studio
          </strong>

          <span>
            Pagos y renovaciones
          </span>
        </div>

        <div
          className={`${styles.statusIcon} ${content.statusClass}`}
        >
          {state === "pagado"
            ? "✓"
            : state ===
                "pendiente"
              ? "…"
              : "!"}
        </div>

        <span
          className={
            styles.eyebrow
          }
        >
          {content.eyebrow}
        </span>

        <h1>
          {content.title}
        </h1>

        <p>
          {content.description}
        </p>

        {order && (
          <div
            className={
              styles.order
            }
          >
            <span>
              Orden Flow
            </span>

            <strong>
              #{order}
            </strong>
          </div>
        )}

        <div
          className={
            styles.actions
          }
        >
          <Link
            className={
              styles.primaryButton
            }
            href="https://www.vialoop.cl"
          >
            Ir a Vialoop
          </Link>

          <a
            className={
              styles.secondaryButton
            }
            href="mailto:hosting@vialoop.cl"
          >
            Contactar soporte
          </a>
        </div>

        <footer>
          Vialoop Studio SpA
          <br />
          hosting@vialoop.cl
        </footer>
      </section>
    </main>
  );
}