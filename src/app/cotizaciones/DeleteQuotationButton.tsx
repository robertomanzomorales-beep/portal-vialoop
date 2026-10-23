"use client";

import {
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { deleteQuotation } from "./actions";
import styles from "./cotizaciones.module.css";

type Props = {
  quotationId: string;
  quotationNumber: string;
};

export default function DeleteQuotationButton({
  quotationId,
  quotationNumber,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] =
    useTransition();
  const [error, setError] = useState("");
  const [deleted, setDeleted] =
    useState(false);

  function handleDelete() {
    const confirmed = window.confirm(
      `¿Eliminar ${quotationNumber}? Se quitará también su plazo del calendario de seguimiento.`,
    );

    if (!confirmed) {
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const result = await deleteQuotation(
          quotationId,
        );

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setDeleted(true);
        router.refresh();
      } catch {
        setError(
          "No fue posible eliminar la cotización.",
        );
      }
    });
  }

  if (deleted) {
    return (
      <span
        aria-live="polite"
        className={styles.deletedLabel}
      >
        Eliminada
      </span>
    );
  }

  return (
    <span className={styles.deleteControl}>
      <button
        aria-label={`Eliminar ${quotationNumber}`}
        className={styles.deleteQuotationButton}
        disabled={pending}
        onClick={handleDelete}
        type="button"
      >
        {pending ? "Eliminando..." : "Eliminar"}
      </button>
      {error ? (
        <small aria-live="assertive">
          {error}
        </small>
      ) : null}
    </span>
  );
}
