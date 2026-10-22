"use client";

import { deleteClient } from "./actions";
import styles from "./clientes.module.css";

export default function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const action =
    deleteClient.bind(null, clientId);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed =
          window.confirm(
            `¿Eliminar definitivamente a ${clientName}?\n\nSe eliminarán también sus proyectos, solicitudes, renovaciones, pagos y ventas relacionadas. Esta acción no se puede deshacer.`,
          );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button
        className={styles.dangerButton}
        type="submit"
      >
        Eliminar cliente
      </button>
    </form>
  );
}
