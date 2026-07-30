import Link from "next/link";
import styles from "../cobros.module.css";

type ResultPageProps = {
  searchParams: Promise<{
    estado?: string;
    orden?: string;
  }>;
};

export default async function ChargeResultPage({
  searchParams,
}: ResultPageProps) {
  const params = await searchParams;
  const state = params.estado ?? "error";
  const messages: Record<string, { title: string; text: string }> = {
    pagado: {
      title: "Pago confirmado",
      text: "Flow confirmó el pago y el abono quedó registrado en la venta.",
    },
    pendiente: {
      title: "Pago pendiente",
      text: "Flow todavía mantiene la operación pendiente de confirmación.",
    },
    rechazado: {
      title: "Pago rechazado",
      text: "La operación fue rechazada y no se registró ningún abono.",
    },
    anulado: {
      title: "Pago anulado",
      text: "La operación fue anulada y el cobro continúa sin pago.",
    },
    error: {
      title: "No fue posible verificar el pago",
      text: "Revisa el cobro en el portal antes de realizar otra acción.",
    },
  };
  const message = messages[state] ?? messages.error;

  return (
    <main className={styles.resultPage}>
      <section className={styles.resultCard}>
        <span className={styles.eyebrow}>Resultado Flow</span>
        <h1>{message.title}</h1>
        <p>{message.text}</p>
        {params.orden ? <small>Orden Flow: {params.orden}</small> : null}
        <Link className={styles.primaryButton} href="/cobros">
          Volver a Cobros
        </Link>
      </section>
    </main>
  );
}
