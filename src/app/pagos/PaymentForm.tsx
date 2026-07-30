"use client";

import {
  useEffect,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { markPaymentAsPaid } from "./actions";
import styles from "./pagos.module.css";

type Props = {
  paymentId: string;
  clientName: string;
  description: string;
  amount: number;
};

function today() {
  const value = new Date();
  const local = new Date(
    value.getTime() -
      value.getTimezoneOffset() *
        60 *
        1000,
  );

  return local
    .toISOString()
    .slice(0, 10);
}

function SubmitButton() {
  const { pending } =
    useFormStatus();

  return (
    <button
      className={
        styles.submitButton
      }
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Registrando..."
        : "Confirmar pago"}
    </button>
  );
}

export default function PaymentForm({
  paymentId,
  clientName,
  description,
  amount,
}: Props) {
  const [open, setOpen] =
    useState(false);

  const action =
    markPaymentAsPaid.bind(
      null,
      paymentId,
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    const keydown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape"
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      keydown,
    );
    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        keydown,
      );
      document.body.style.overflow =
        "";
    };
  }, [open]);

  return (
    <>
      <button
        className={
          styles.primaryAction
        }
        onClick={() =>
          setOpen(true)
        }
        type="button"
      >
        Registrar pago
      </button>

      {open && (
        <div
          className={
            styles.modalBackdrop
          }
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
            aria-labelledby="payment-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <header
              className={
                styles.modalHeader
              }
            >
              <div>
                <span
                  className={
                    styles.modalEyebrow
                  }
                >
                  Registro financiero
                </span>
                <h2 id="payment-title">
                  Confirmar pago
                </h2>
              </div>

              <button
                aria-label="Cerrar"
                className={
                  styles.modalClose
                }
                onClick={() =>
                  setOpen(false)
                }
                type="button"
              >
                ×
              </button>
            </header>

            <div
              className={
                styles.paymentSummary
              }
            >
              <div>
                <span>Cliente</span>
                <strong>
                  {clientName}
                </strong>
              </div>
              <div>
                <span>Servicio</span>
                <strong>
                  {description}
                </strong>
              </div>
              <div>
                <span>Monto</span>
                <strong>
                  {new Intl.NumberFormat(
                    "es-CL",
                    {
                      style:
                        "currency",
                      currency:
                        "CLP",
                      maximumFractionDigits: 0,
                    },
                  ).format(amount)}
                </strong>
              </div>
            </div>

            <form
              action={action}
              className={
                styles.paymentForm
              }
            >
              <div
                className={
                  styles.formGrid
                }
              >
                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Fecha real del pago
                  </span>
                  <input
                    defaultValue={today()}
                    name="paidAt"
                    required
                    type="date"
                  />
                </label>

                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Medio de pago
                  </span>
                  <select
                    defaultValue="BANK_TRANSFER"
                    name="paymentMethod"
                  >
                    <option value="BANK_TRANSFER">
                      Transferencia bancaria
                    </option>
                    <option value="FLOW">
                      Flow
                    </option>
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

                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Monto recibido
                  </span>
                  <input
                    defaultValue={amount}
                    min="1"
                    name="paidAmount"
                    required
                    step="1"
                    type="number"
                  />
                </label>

                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Número de operación
                  </span>
                  <input
                    name="paymentReference"
                    type="text"
                  />
                </label>

                <label
                  className={`${styles.field} ${styles.fullWidth}`}
                >
                  <span>
                    Observaciones
                  </span>
                  <textarea
                    name="paymentNotes"
                    rows={3}
                  />
                </label>
              </div>

              <div
                className={
                  styles.paymentOptions
                }
              >
                <label
                  className={
                    styles.checkboxField
                  }
                >
                  <input
                    defaultChecked
                    name="createNextRenewal"
                    type="checkbox"
                  />
                  <span>
                    <strong>
                      Crear próxima renovación
                    </strong>
                    <small>
                      Genera el siguiente
                      vencimiento según su
                      ciclo.
                    </small>
                  </span>
                </label>

                <label
                  className={`${styles.checkboxField} ${styles.testOption}`}
                >
                  <input
                    name="isTest"
                    type="checkbox"
                  />
                  <span>
                    <strong>
                      Registro de prueba
                    </strong>
                    <small>
                      No modifica la
                      renovación ni envía
                      correos.
                    </small>
                  </span>
                </label>
              </div>

              <footer
                className={
                  styles.modalFooter
                }
              >
                <button
                  className={
                    styles.cancelModalButton
                  }
                  onClick={() =>
                    setOpen(false)
                  }
                  type="button"
                >
                  Volver
                </button>
                <SubmitButton />
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
