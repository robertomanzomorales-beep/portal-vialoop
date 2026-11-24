"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptQuotation } from "./actions";
import styles from "./cotizaciones.module.css";

export default function AcceptQuotationButton({
  quotationId,
  quotationNumber,
  repairOnly = false,
}: {
  quotationId: string;
  quotationNumber: string;
  repairOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const accept = () => {
    if (
      !window.confirm(
        repairOnly
          ? `¿Completar el vínculo comercial de ${quotationNumber}? Se conciliará con su venta y cobro sin duplicar registros.`
          : `¿Confirmas que ${quotationNumber} fue aceptada? Se creará la venta, el cobro pendiente y la oportunidad quedará ganada.`,
      )
    ) {
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const result = await acceptQuotation(quotationId);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        router.refresh();
      } catch {
        setError("No fue posible confirmar la cotización. Actualiza la página e inténtalo nuevamente.");
      }
    });
  };

  return (
    <div className={styles.acceptAction}>
      <button
        className={styles.acceptButton}
        disabled={pending}
        onClick={accept}
        type="button"
      >
        {pending
          ? "Conciliando..."
          : repairOnly
            ? "Completar vínculo"
            : "Aceptar y crear venta"}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
