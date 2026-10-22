"use client";

import { deleteSupportRequest } from "./actions";
import styles from "./solicitudes.module.css";

export default function DeleteSupportRequestButton({
  requestId,
  requestNumber,
}: {
  requestId: string;
  requestNumber: number;
}) {
  const action =
    deleteSupportRequest.bind(
      null,
      requestId,
    );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `¿Eliminar la solicitud #${requestNumber
              .toString()
              .padStart(4, "0")}?\n\nUsa esta opción para spam o registros inválidos. La eliminación no se puede deshacer.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        className={styles.dangerButton}
        type="submit"
      >
        Eliminar
      </button>
    </form>
  );
}
