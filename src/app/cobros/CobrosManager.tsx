"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  cancelManualCharge,
  createAndSendManualCharge,
  markManualChargeAsPaid,
  resendManualCharge,
  type ChargeActionState,
} from "./actions";
import styles from "./cobros.module.css";

export type ChargeSaleOption = {
  id: string;
  number: number;
  clientName: string;
  contactName: string;
  email: string;
  service: string;
  balance: number;
  formattedBalance: string;
};

export type ChargeListItem = {
  id: string;
  number: number;
  saleNumber: number;
  clientName: string;
  concept: string;
  amount: string;
  recipientEmail: string;
  method: "FLOW" | "BANK_TRANSFER";
  methodLabel: string;
  status:
    | "PENDING"
    | "SENT"
    | "PAID"
    | "REJECTED"
    | "CANCELLED"
    | "ERROR";
  statusLabel: string;
  emailStatus: "PENDING" | "SENT" | "FAILED";
  dueDate: string;
  createdAt: string;
  paymentUrl: string;
  lastError: string;
};

const initialState: ChargeActionState = {
  ok: false,
  message: "",
};

function today() {
  const value = new Date();
  const local = new Date(
    value.getTime() - value.getTimezoneOffset() * 60 * 1000,
  );

  return local.toISOString().slice(0, 10);
}

function SubmitButton({
  idle,
  pending,
  className,
}: {
  idle: string;
  pending: string;
  className?: string;
}) {
  const status = useFormStatus();

  return (
    <button
      className={className || styles.primaryButton}
      disabled={status.pending}
      type="submit"
    >
      {status.pending ? pending : idle}
    </button>
  );
}

function ActionMessage({ state }: { state: ChargeActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={state.ok ? styles.successMessage : styles.errorMessage}>
      {state.message}
    </p>
  );
}

function NewChargeModal({
  sales,
  onClose,
}: {
  sales: ChargeSaleOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    createAndSendManualCharge,
    initialState,
  );
  const [saleId, setSaleId] = useState(sales[0]?.id || "");
  const sale = useMemo(
    () => sales.find((item) => item.id === saleId) ?? sales[0],
    [saleId, sales],
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  if (!sale) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Solicitud manual</span>
            <h2>Crear y enviar cobro</h2>
            <p>
              Se enviará solo cuando presiones el botón. No crea períodos ni
              recordatorios.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form action={formAction} className={styles.form}>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Venta asociada</span>
            <select
              name="saleId"
              onChange={(event) => setSaleId(event.target.value)}
              value={sale.id}
            >
              {sales.map((item) => (
                <option key={item.id} value={item.id}>
                  Venta #{item.number} · {item.clientName} · {item.service}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.saleSummary}>
            <span>Saldo disponible para cobrar</span>
            <strong>{sale.formattedBalance}</strong>
          </div>

          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Concepto del cobro</span>
            <input
              defaultValue={`Saldo pendiente ${sale.service}`}
              key={`concept-${sale.id}`}
              name="concept"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Monto a cobrar, IVA incluido</span>
            <input
              defaultValue={sale.balance}
              key={`amount-${sale.id}`}
              max={sale.balance}
              min="1"
              name="amount"
              required
              step="1"
              type="number"
            />
          </label>

          <label className={styles.field}>
            <span>Método</span>
            <select defaultValue="FLOW" name="method">
              <option value="FLOW">Flow + transferencia</option>
              <option value="BANK_TRANSFER">Solo transferencia</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Nombre del destinatario</span>
            <input
              defaultValue={sale.contactName || sale.clientName}
              key={`name-${sale.id}`}
              name="recipientName"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Correo del destinatario</span>
            <input
              defaultValue={sale.email}
              key={`email-${sale.id}`}
              name="recipientEmail"
              required
              type="email"
            />
          </label>

          <label className={styles.field}>
            <span>Fecha límite informativa</span>
            <input name="dueDate" type="date" />
          </label>

          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Mensaje adicional</span>
            <textarea
              name="message"
              placeholder="Opcional. Ej.: Corresponde al 50% restante acordado."
              rows={3}
            />
          </label>

          <ActionMessage state={state} />

          <div className={styles.formActions}>
            <button
              className={styles.secondaryButton}
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <SubmitButton
              idle="Crear y enviar cobro"
              pending="Creando y enviando..."
            />
          </div>
        </form>
      </div>
    </div>
  );
}

function ResendButton({ chargeId }: { chargeId: string }) {
  const router = useRouter();
  const action = resendManualCharge.bind(null, chargeId);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <form action={formAction} className={styles.inlineAction}>
      <SubmitButton
        className={styles.textButton}
        idle="Reenviar"
        pending="Enviando..."
      />
      <ActionMessage state={state} />
    </form>
  );
}

function TransferConfirmation({ charge }: { charge: ChargeListItem }) {
  const action = markManualChargeAsPaid.bind(null, charge.id);

  return (
    <details className={styles.inlineDetails}>
      <summary>Confirmar transferencia</summary>
      <form action={action} className={styles.inlineForm}>
        <label className={styles.field}>
          <span>Fecha del pago</span>
          <input defaultValue={today()} name="paidAt" required type="date" />
        </label>
        <label className={styles.field}>
          <span>N.º de operación</span>
          <input name="reference" placeholder="Opcional" />
        </label>
        <SubmitButton idle="Registrar como pagado" pending="Registrando..." />
      </form>
    </details>
  );
}

export default function CobrosManager({
  sales,
  charges,
}: {
  sales: ChargeSaleOption[];
  charges: ChargeListItem[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className={styles.listHeader}>
        <div>
          <span className={styles.eyebrow}>Gestión manual</span>
          <h2>Historial de cobros</h2>
          <p>
            Solicitudes vinculadas a ventas. Hosting y renovaciones no se
            mezclan con este registro.
          </p>
        </div>

        <button
          className={styles.primaryButton}
          disabled={sales.length === 0}
          onClick={() => setModalOpen(true)}
          type="button"
        >
          Nuevo cobro
        </button>
      </div>

      {sales.length === 0 ? (
        <div className={styles.infoBanner}>
          No existen ventas activas con saldo pendiente. Registra la venta o
          revisa sus pagos antes de crear un cobro.
        </div>
      ) : null}

      {charges.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>Aún no hay cobros manuales</strong>
          <p>El primer cobro enviado aparecerá en este historial.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Cliente / venta</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id}>
                  <td>
                    #{String(charge.number).padStart(4, "0")}
                    <small>{charge.createdAt}</small>
                  </td>
                  <td>
                    <strong>{charge.clientName}</strong>
                    <small>Venta #{charge.saleNumber}</small>
                    <small>{charge.recipientEmail}</small>
                  </td>
                  <td>
                    <strong>{charge.concept}</strong>
                    {charge.dueDate ? (
                      <small>Fecha límite: {charge.dueDate}</small>
                    ) : null}
                  </td>
                  <td className={styles.amountCell}>{charge.amount}</td>
                  <td>{charge.methodLabel}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        charge.status === "PAID"
                          ? styles.statusPaid
                          : charge.status === "SENT" ||
                              charge.status === "PENDING"
                            ? styles.statusOpen
                            : charge.status === "ERROR"
                              ? styles.statusError
                              : styles.statusClosed
                      }`}
                    >
                      {charge.statusLabel}
                    </span>
                    <small>
                      Correo:{" "}
                      {charge.emailStatus === "SENT"
                        ? "enviado"
                        : charge.emailStatus === "FAILED"
                          ? "con error"
                          : "pendiente"}
                    </small>
                    {charge.lastError ? (
                      <small className={styles.errorText}>
                        {charge.lastError}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {charge.paymentUrl &&
                      charge.status !== "PAID" &&
                      charge.status !== "CANCELLED" ? (
                        <a
                          className={styles.textLink}
                          href={charge.paymentUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir Flow
                        </a>
                      ) : null}

                      {!["PAID", "CANCELLED", "REJECTED"].includes(
                        charge.status,
                      ) ? (
                        <>
                          <ResendButton chargeId={charge.id} />
                          <TransferConfirmation charge={charge} />
                          <form
                            action={cancelManualCharge}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  "¿Seguro que deseas cancelar este cobro?",
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input
                              name="chargeId"
                              type="hidden"
                              value={charge.id}
                            />
                            <button
                              className={styles.dangerButton}
                              type="submit"
                            >
                              Cancelar
                            </button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <NewChargeModal onClose={() => setModalOpen(false)} sales={sales} />
      ) : null}
    </>
  );
}
