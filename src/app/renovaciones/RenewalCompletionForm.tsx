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
  contactName: string;
  recipient: string;
  description: string;
  domain: string;
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

function SubmitButton({
  canSubmit,
  sendConfirmation,
}: {
  canSubmit: boolean;
  sendConfirmation: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.confirmSentButton}
      disabled={pending || !canSubmit}
      type="submit"
    >
      {pending
        ? "Regularizando..."
        : sendConfirmation
          ? "Confirmar renovación y enviar"
          : "Confirmar pago y renovación"}
    </button>
  );
}

export default function RenewalCompletionForm({
  renewalId,
  clientName,
  contactName,
  recipient,
  description,
  domain,
  amount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient),
  );
  const [confirmationRecipient, setConfirmationRecipient] = useState(recipient);
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
              Registra el pago real, cierra este vencimiento y, si corresponde,
              envía al cliente una confirmación editable con la continuidad del servicio.
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

              <section className={styles.confirmationPanel}>
                <label className={styles.confirmationToggle}>
                  <input
                    checked={sendConfirmation}
                    name="sendConfirmation"
                    onChange={(event) => setSendConfirmation(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>Enviar confirmación de renovación</strong>
                    <small>
                      El correo usa el formato Vialoop e informa pago, servicio y
                      próximo vencimiento. Puedes editarlo antes de enviar.
                    </small>
                  </span>
                </label>

                {sendConfirmation ? (
                  <div className={styles.confirmationFields}>
                    <label className={styles.field}>
                      <span>Destinatario</span>
                      <input
                        name="confirmationRecipient"
                        onChange={(event) => setConfirmationRecipient(event.target.value)}
                        required
                        type="email"
                        value={confirmationRecipient}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Asunto</span>
                      <input
                        defaultValue={`Hosting renovado · ${domain}`}
                        maxLength={180}
                        name="confirmationSubject"
                        required
                      />
                    </label>

                    <label className={`${styles.field} ${styles.confirmationMessage}`}>
                      <span>Mensaje editable</span>
                      <textarea
                        defaultValue={
                          contactName
                            ? `Confirmamos que la renovación del servicio fue procesada correctamente. Gracias, ${contactName}, por continuar confiando en Vialoop.`
                            : "Confirmamos que la renovación del servicio fue procesada correctamente. Gracias por continuar confiando en Vialoop."
                        }
                        maxLength={3000}
                        name="confirmationMessage"
                        required
                        rows={4}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

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
                <SubmitButton
                  canSubmit={
                    !sendConfirmation ||
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmationRecipient.trim())
                  }
                  sendConfirmation={sendConfirmation}
                />
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
