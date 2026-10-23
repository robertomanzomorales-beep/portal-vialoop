"use client";

import {
  useEffect,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { confirmRenewalAsPaid } from "./actions";
import styles from "./renovaciones.module.css";

type Props = {
  renewalId: string;
  clientName: string;
  description: string;
  amount: string;
};

function chileToday() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    },
  ).format(new Date());
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.confirmSentButton}
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Regularizando..."
        : "Confirmar pago y renovación"}
    </button>
  );
}

export default function RenewalCompletionForm({
  renewalId,
  clientName,
  description,
  amount,
}: Props) {
  const [open, setOpen] = useState(false);
  const action = confirmRenewalAsPaid.bind(
    null,
    renewalId,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );
    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        className={styles.completeAction}
        onClick={() => setOpen(true)}
        type="button"
      >
        Registrar renovación
      </button>

      {open ? (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setOpen(false);
            }
          }}
          role="presentation"
        >
          <section
            aria-labelledby={`renewal-completion-${renewalId}`}
            aria-modal="true"
            className={`${styles.modal} ${styles.completionModal}`}
            role="dialog"
          >
            <header
              className={styles.modalHeader}
            >
              <div>
                <span
                  className={styles.modalEyebrow}
                >
                  Cierre de ciclo
                </span>
                <h2
                  id={`renewal-completion-${renewalId}`}
                >
                  Confirmar renovación
                </h2>
              </div>

              <button
                aria-label="Cerrar"
                className={styles.modalClose}
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            <p className={styles.modalIntro}>
              Registra el pago real, cierra este
              vencimiento y detiene sus avisos.
            </p>

            <div className={styles.emailSummary}>
              <div>
                <span>Cliente</span>
                <strong>{clientName}</strong>
              </div>
              <div>
                <span>Servicio</span>
                <strong>{description}</strong>
              </div>
              <div>
                <span>Monto registrado</span>
                <strong>{amount}</strong>
              </div>
            </div>

            <form
              action={action}
              className={styles.emailForm}
            >
              <div
                className={styles.completionGrid}
              >
                <label className={styles.field}>
                  <span>Fecha real del pago</span>
                  <input
                    defaultValue={chileToday()}
                    name="paidAt"
                    required
                    type="date"
                  />
                </label>

                <label className={styles.field}>
                  <span>Medio de pago</span>
                  <select
                    defaultValue="BANK_TRANSFER"
                    name="paymentMethod"
                  >
                    <option value="BANK_TRANSFER">
                      Transferencia bancaria
                    </option>
                    <option value="FLOW">Flow</option>
                    <option value="DEBIT_CARD">
                      Tarjeta de débito
                    </option>
                    <option value="CREDIT_CARD">
                      Tarjeta de crédito
                    </option>
                    <option value="CASH">
                      Efectivo
                    </option>
                    <option value="OTHER">
                      Otro
                    </option>
                  </select>
                </label>
              </div>

              <label
                className={styles.completionOption}
              >
                <input
                  defaultChecked
                  name="createNextRenewal"
                  type="checkbox"
                />
                <span>
                  <strong>
                    Crear el próximo vencimiento
                  </strong>
                  <small>
                    Mantiene el calendario futuro según
                    el ciclo mensual, semestral o anual
                    del servicio.
                  </small>
                </span>
              </label>

              <div className={styles.manualNotice}>
                <strong>Resultado del registro</strong>
                <p>
                  El ciclo actual dejará de aparecer entre
                  las pendientes. Con la próxima renovación
                  activada quedará como renovado; sin ella,
                  como pagado. El cobro asociado también se
                  regularizará o se creará cuando haya monto.
                </p>
              </div>

              <footer className={styles.modalFooter}>
                <button
                  className={styles.cancelModalButton}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <SubmitButton />
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
