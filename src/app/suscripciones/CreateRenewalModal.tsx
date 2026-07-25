"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { createRenewalFromSubscription } from "./actions";
import styles from "./suscripciones.module.css";

type CreateRenewalModalProps = {
  subscriptionId: string;
  clientName: string;
  planName: string;
  projectName: string;
  billingCycle: string;
  defaultDueDate: string;
  defaultNetAmount: number;
  disabled?: boolean;
  disabledReason?: string;
};

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={
        styles.confirmModalButton
      }
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Creando renovación..."
        : "Confirmar y crear renovación"}
    </button>
  );
}

export default function CreateRenewalModal({
  subscriptionId,
  clientName,
  planName,
  projectName,
  billingCycle,
  defaultDueDate,
  defaultNetAmount,
  disabled = false,
  disabledReason,
}: CreateRenewalModalProps) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [dueDate, setDueDate] =
    useState(defaultDueDate);

  const [netAmount, setNetAmount] =
    useState(
      String(defaultNetAmount),
    );

  const numericNetAmount =
    useMemo(() => {
      const value =
        Number(netAmount);

      return Number.isFinite(value) &&
        value > 0
        ? Math.round(value)
        : 0;
    }, [netAmount]);

  const vatAmount = useMemo(
    () =>
      Math.round(
        numericNetAmount * 0.19,
      ),
    [numericNetAmount],
  );

  const totalWithVat = useMemo(
    () =>
      numericNetAmount +
      vatAmount,
    [numericNetAmount, vatAmount],
  );

  const action =
    createRenewalFromSubscription.bind(
      null,
      subscriptionId,
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
      <div
        className={
          styles.renewalButtonArea
        }
      >
        <button
          className={
            styles.createRenewalButton
          }
          disabled={disabled}
          onClick={() =>
            setIsOpen(true)
          }
          type="button"
        >
          Crear renovación
        </button>

        {disabled &&
          disabledReason && (
            <span
              className={
                styles.disabledHint
              }
            >
              {disabledReason}
            </span>
          )}
      </div>

      {isOpen && (
        <div
          className={
            styles.modalBackdrop
          }
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
            aria-labelledby="create-renewal-title"
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
                  Confirmación financiera
                </span>

                <h2 id="create-renewal-title">
                  Crear renovación
                </h2>
              </div>

              <button
                aria-label="Cerrar"
                className={
                  styles.modalClose
                }
                onClick={() =>
                  setIsOpen(false)
                }
                type="button"
              >
                ×
              </button>
            </header>

            <p
              className={
                styles.modalIntro
              }
            >
              Revisa cuidadosamente los
              datos. Esta acción creará una
              renovación, pero no generará un
              cobro ni registrará un pago.
            </p>

            <div
              className={
                styles.renewalSummary
              }
            >
              <div>
                <span>Cliente</span>
                <strong>
                  {clientName}
                </strong>
              </div>

              <div>
                <span>Plan</span>
                <strong>
                  {planName}
                </strong>
              </div>

              <div>
                <span>
                  Proyecto o servicio
                </span>
                <strong>
                  {projectName}
                </strong>
              </div>

              <div>
                <span>
                  Ciclo de cobro
                </span>
                <strong>
                  {billingCycle}
                </strong>
              </div>
            </div>

            <form
              action={action}
              className={
                styles.modalForm
              }
            >
              <div
                className={
                  styles.modalFields
                }
              >
                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Fecha de vencimiento *
                  </span>

                  <input
                    name="dueDate"
                    onChange={(event) =>
                      setDueDate(
                        event.target.value,
                      )
                    }
                    required
                    type="date"
                    value={dueDate}
                  />
                </label>

                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Precio neto *
                  </span>

                  <input
                    inputMode="numeric"
                    min="1"
                    name="netAmount"
                    onChange={(event) =>
                      setNetAmount(
                        event.target.value,
                      )
                    }
                    required
                    step="1"
                    type="number"
                    value={netAmount}
                  />
                </label>
              </div>

              <div
                className={
                  styles.amountBreakdown
                }
              >
                <div>
                  <span>Precio neto</span>

                  <strong>
                    {formatCurrency(
                      numericNetAmount,
                    )}
                  </strong>
                </div>

                <div>
                  <span>IVA 19%</span>

                  <strong>
                    {formatCurrency(
                      vatAmount,
                    )}
                  </strong>
                </div>

                <div
                  className={
                    styles.totalRow
                  }
                >
                  <span>
                    Total con IVA
                  </span>

                  <strong>
                    {formatCurrency(
                      totalWithVat,
                    )}
                  </strong>
                </div>
              </div>

              <label
                className={
                  styles.confirmationBox
                }
              >
                <input
                  name="confirmation"
                  required
                  type="checkbox"
                />

                <span>
                  Confirmo que revisé el
                  cliente, el vencimiento y
                  el total con IVA. Entiendo
                  que se creará solamente la
                  renovación y no un cobro.
                </span>
              </label>

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
                    setIsOpen(false)
                  }
                  type="button"
                >
                  Cancelar
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