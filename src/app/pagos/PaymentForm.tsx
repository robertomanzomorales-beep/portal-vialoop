"use client";

import {
  useEffect,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { markPaymentAsPaid } from "./actions";
import styles from "./pagos.module.css";

type PaymentFormProps = {
  paymentId: string;
  clientName: string;
  description: string;
  amount: number;
};

function getTodayForInput() {
  const today = new Date();
  const localDate = new Date(
    today.getTime() -
      today.getTimezoneOffset() *
        60 *
        1000,
  );

  return localDate
    .toISOString()
    .slice(0, 10);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.submitButton}
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
}: PaymentFormProps) {
  const [isOpen, setIsOpen] =
    useState(false);

  const action =
    markPaymentAsPaid.bind(
      null,
      paymentId,
    );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

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

      document.body.style.overflow =
        "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        className={styles.primaryAction}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Registrar pago
      </button>

      {isOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setIsOpen(false);
            }
          }}
          role="presentation"
        >
          <section
            aria-labelledby="payment-modal-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <header
              className={styles.modalHeader}
            >
              <div>
                <span
                  className={
                    styles.modalEyebrow
                  }
                >
                  Registro financiero
                </span>

                <h2 id="payment-modal-title">
                  Confirmar pago
                </h2>
              </div>

              <button
                aria-label="Cerrar formulario"
                className={styles.modalClose}
                onClick={() =>
                  setIsOpen(false)
                }
                type="button"
              >
                ×
              </button>
            </header>

            <p className={styles.modalIntro}>
              Revisa los antecedentes antes de
              cerrar el cobro y crear el próximo
              vencimiento.
            </p>

            <div
              className={
                styles.paymentSummary
              }
            >
              <div>
                <span>Cliente</span>
                <strong>{clientName}</strong>
              </div>

              <div>
                <span>Servicio</span>
                <strong>
                  {description}
                </strong>
              </div>

              <div>
                <span>Monto registrado</span>
                <strong>
                  {new Intl.NumberFormat(
                    "es-CL",
                    {
                      style: "currency",
                      currency: "CLP",
                      maximumFractionDigits: 0,
                    },
                  ).format(amount)}
                </strong>
              </div>
            </div>

            <form
              action={action}
              className={styles.paymentForm}
            >
              <div
                className={styles.formGrid}
              >
                <label
                  className={styles.field}
                >
                  <span>
                    Fecha real del pago
                  </span>

                  <input
                    defaultValue={getTodayForInput()}
                    name="paidAt"
                    required
                    type="date"
                  />
                </label>

                <label
                  className={styles.field}
                >
                  <span>Medio de pago</span>

                  <select
                    defaultValue="BANK_TRANSFER"
                    name="paymentMethod"
                  >
                    <option value="BANK_TRANSFER">
                      Transferencia bancaria
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
                  className={styles.field}
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
                  className={styles.field}
                >
                  <span>
                    Número de operación
                  </span>

                  <input
                    name="paymentReference"
                    placeholder="Ej. 00872145"
                    type="text"
                  />
                </label>

                <label
                  className={`${styles.field} ${styles.fullWidth}`}
                >
                  <span>Observaciones</span>

                  <textarea
                    name="paymentNotes"
                    placeholder="Banco, diferencia de monto, acuerdo comercial u otro antecedente."
                    rows={4}
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
                      Crear próxima
                      renovación
                    </strong>

                    <small>
                      Cerrará la renovación
                      actual y generará el
                      próximo vencimiento un
                      año después.
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
                      No cerrará ni modificará
                      la renovación del cliente
                      y se excluirá de los
                      totales reales.
                    </small>
                  </span>
                </label>
              </div>

              <footer
                className={styles.modalFooter}
              >
                <button
                  className={
                    styles.cancelModalButton
                  }
                  onClick={() =>
                    setIsOpen(false)
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