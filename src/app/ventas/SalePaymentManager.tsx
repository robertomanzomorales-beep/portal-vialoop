"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  registerSalePayment,
  resendSalePaymentInvoice,
  sendSalePaymentReceipt,
  uploadAndSendSalePaymentInvoice,
  type FinancialActionState,
} from "./financial-actions";
import styles from "./ventas.module.css";

type EmailStatus = "PENDING" | "SENT" | "FAILED";

export type SalePaymentItem = {
  id: string;
  amount: number;
  formattedAmount: string;
  paidAt: string;
  displayDate: string;
  method: string;
  methodLabel: string;
  reference: string;
  notes: string;
  receipt: {
    number: number;
    recipientName: string;
    recipientEmail: string;
    serviceDescription: string;
    projectReference: string;
    paymentReference: string;
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    balanceAmount: number;
    emailStatus: EmailStatus;
    lastError: string;
  } | null;
  invoice: {
    invoiceNumber: string;
    issueDate: string;
    recipientName: string;
    recipientEmail: string;
    serviceDescription: string;
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    paymentCondition: string;
    fileName: string;
    emailStatus: EmailStatus;
    lastError: string;
  } | null;
};

export type SaleFinancialItem = {
  id: string;
  number: number;
  clientName: string;
  contactName: string;
  clientEmail: string;
  service: string;
  grossAmount: number;
  formattedGrossAmount: string;
  paidAmount: number;
  formattedPaidAmount: string;
  balanceAmount: number;
  formattedBalanceAmount: string;
  financialStatus: "UNPAID" | "PARTIAL" | "PAID";
  payments: SalePaymentItem[];
};

const initialState: FinancialActionState = {
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

function amountsFromTotal(total: number) {
  const net = Math.round(total / 1.19);

  return {
    net,
    tax: total - net,
  };
}

function SubmitButton({
  idle,
  pending,
}: {
  idle: string;
  pending: string;
}) {
  const status = useFormStatus();

  return (
    <button
      className={styles.primaryButton}
      disabled={status.pending}
      type="submit"
    >
      {status.pending ? pending : idle}
    </button>
  );
}

function ActionMessage({ state }: { state: FinancialActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.ok ? styles.formSuccess : styles.formError
      }
    >
      {state.message}
    </p>
  );
}

function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span
      className={`${styles.emailStatus} ${
        status === "SENT"
          ? styles.emailSent
          : status === "FAILED"
            ? styles.emailFailed
            : styles.emailPending
      }`}
    >
      {status === "SENT"
        ? "Enviado"
        : status === "FAILED"
          ? "Error"
          : "Pendiente"}
    </span>
  );
}

function RegisterPaymentForm({
  sale,
}: {
  sale: SaleFinancialItem;
}) {
  const router = useRouter();
  const action = registerSalePayment.bind(null, sale.id);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <form action={formAction} className={styles.financeForm}>
      <div className={styles.financeSectionHeader}>
        <div>
          <span className={styles.eyebrow}>Dinero recibido</span>
          <h3>Registrar pago o abono</h3>
        </div>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Monto recibido, IVA incluido</span>
          <input
            defaultValue={sale.balanceAmount}
            max={sale.balanceAmount}
            min="1"
            name="amount"
            required
            step="1"
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>Fecha del pago</span>
          <input defaultValue={today()} name="paidAt" required type="date" />
        </label>

        <label className={styles.field}>
          <span>Medio de pago</span>
          <select defaultValue="BANK_TRANSFER" name="method">
            <option value="BANK_TRANSFER">Transferencia bancaria</option>
            <option value="FLOW">Flow</option>
            <option value="CREDIT_CARD">Tarjeta de crédito</option>
            <option value="DEBIT_CARD">Tarjeta de débito</option>
            <option value="CASH">Efectivo</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>N.º de operación</span>
          <input name="reference" placeholder="Opcional" type="text" />
        </label>

        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Observaciones</span>
          <textarea name="notes" placeholder="Opcional" rows={2} />
        </label>
      </div>

      <ActionMessage state={state} />

      <div className={styles.formActions}>
        <SubmitButton idle="Registrar pago" pending="Registrando..." />
      </div>
    </form>
  );
}

function ReceiptForm({
  sale,
  payment,
}: {
  sale: SaleFinancialItem;
  payment: SalePaymentItem;
}) {
  const defaults = amountsFromTotal(payment.amount);
  const action = sendSalePaymentReceipt.bind(null, payment.id);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.documentForm}>
      <div className={styles.documentTitle}>
        <div>
          <strong>Recibo desde pagos@vialoop.cl</strong>
          <small>
            {payment.receipt
              ? `Recibo N.º ${String(payment.receipt.number).padStart(4, "0")}`
              : "Aún no emitido"}
          </small>
        </div>
        {payment.receipt ? (
          <EmailStatusBadge status={payment.receipt.emailStatus} />
        ) : null}
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Nombre del destinatario</span>
          <input
            defaultValue={
              payment.receipt?.recipientName ||
              sale.contactName ||
              sale.clientName
            }
            name="recipientName"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Correo</span>
          <input
            defaultValue={
              payment.receipt?.recipientEmail || sale.clientEmail
            }
            name="recipientEmail"
            required
            type="email"
          />
        </label>

        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Servicio pagado</span>
          <input
            defaultValue={
              payment.receipt?.serviceDescription || sale.service
            }
            name="serviceDescription"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Dominio o proyecto</span>
          <input
            defaultValue={payment.receipt?.projectReference || ""}
            name="projectReference"
            placeholder="Opcional"
          />
        </label>

        <label className={styles.field}>
          <span>N.º de operación</span>
          <input
            defaultValue={
              payment.receipt?.paymentReference || payment.reference
            }
            name="paymentReference"
            placeholder="Opcional"
          />
        </label>

        <label className={styles.field}>
          <span>Monto neto</span>
          <input
            defaultValue={payment.receipt?.netAmount ?? defaults.net}
            min="0"
            name="netAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>IVA 19%</span>
          <input
            defaultValue={payment.receipt?.taxAmount ?? defaults.tax}
            min="0"
            name="taxAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>Total pagado</span>
          <input
            defaultValue={payment.receipt?.totalAmount ?? payment.amount}
            min="1"
            name="totalAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>Saldo después del pago</span>
          <input
            defaultValue={
              payment.receipt?.balanceAmount ?? sale.balanceAmount
            }
            disabled
            type="number"
          />
        </label>
      </div>

      <ActionMessage state={state} />
      {payment.receipt?.lastError ? (
        <p className={styles.formError}>{payment.receipt.lastError}</p>
      ) : null}

      <div className={styles.formActions}>
        <SubmitButton
          idle={payment.receipt ? "Actualizar y reenviar recibo" : "Enviar recibo"}
          pending="Enviando..."
        />
      </div>
    </form>
  );
}

function InvoiceForm({
  sale,
  payment,
}: {
  sale: SaleFinancialItem;
  payment: SalePaymentItem;
}) {
  const defaults = amountsFromTotal(payment.amount);
  const createAction = uploadAndSendSalePaymentInvoice.bind(null, payment.id);
  const resendAction = resendSalePaymentInvoice.bind(null, payment.id);
  const [createState, createFormAction] = useActionState(
    createAction,
    initialState,
  );
  const [resendState, resendFormAction] = useActionState(
    resendAction,
    initialState,
  );

  if (payment.invoice) {
    return (
      <form action={resendFormAction} className={styles.documentForm}>
        <div className={styles.documentTitle}>
          <div>
            <strong>Factura {payment.invoice.invoiceNumber}</strong>
            <small>{payment.invoice.fileName}</small>
          </div>
          <EmailStatusBadge status={payment.invoice.emailStatus} />
        </div>

        <dl className={styles.documentSummary}>
          <div>
            <dt>Destinatario</dt>
            <dd>{payment.invoice.recipientEmail}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>
              {new Intl.NumberFormat("es-CL", {
                style: "currency",
                currency: "CLP",
                maximumFractionDigits: 0,
              }).format(payment.invoice.totalAmount)}
            </dd>
          </div>
        </dl>

        <ActionMessage state={resendState} />
        {payment.invoice.lastError ? (
          <p className={styles.formError}>{payment.invoice.lastError}</p>
        ) : null}

        <div className={styles.formActions}>
          <SubmitButton idle="Reenviar factura" pending="Reenviando..." />
        </div>
      </form>
    );
  }

  return (
    <form
      action={createFormAction}
      className={styles.documentForm}
      encType="multipart/form-data"
    >
      <div className={styles.documentTitle}>
        <div>
          <strong>Factura desde facturacion@vialoop.cl</strong>
          <small>Adjunta el PDF ya emitido</small>
        </div>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>N.º de factura</span>
          <input name="invoiceNumber" required />
        </label>

        <label className={styles.field}>
          <span>Fecha de emisión</span>
          <input defaultValue={today()} name="issueDate" required type="date" />
        </label>

        <label className={styles.field}>
          <span>Nombre del destinatario</span>
          <input
            defaultValue={sale.contactName || sale.clientName}
            name="recipientName"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Correo</span>
          <input
            defaultValue={sale.clientEmail}
            name="recipientEmail"
            required
            type="email"
          />
        </label>

        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Servicio facturado</span>
          <input
            defaultValue={sale.service}
            name="serviceDescription"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Monto neto</span>
          <input
            defaultValue={defaults.net}
            min="0"
            name="netAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>IVA 19%</span>
          <input
            defaultValue={defaults.tax}
            min="0"
            name="taxAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>Total factura</span>
          <input
            defaultValue={payment.amount}
            min="1"
            name="totalAmount"
            required
            type="number"
          />
        </label>

        <label className={styles.field}>
          <span>Condición de pago</span>
          <input defaultValue="Contado" name="paymentCondition" />
        </label>

        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Factura PDF, máximo 5 MB</span>
          <input
            accept="application/pdf,.pdf"
            name="invoiceFile"
            required
            type="file"
          />
        </label>
      </div>

      <ActionMessage state={createState} />

      <div className={styles.formActions}>
        <SubmitButton idle="Guardar y enviar factura" pending="Enviando..." />
      </div>
    </form>
  );
}

export default function SalePaymentManager({
  sale,
  onClose,
}: {
  sale: SaleFinancialItem;
  onClose: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <div className={`${styles.modal} ${styles.financeModal}`}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>
              Venta N.º {sale.number}
            </span>
            <h2>Pagos y documentos</h2>
            <p>
              {sale.clientName} · {sale.service}
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
        </div>

        <div className={styles.financeSummary}>
          <article>
            <span>Total con IVA</span>
            <strong>{sale.formattedGrossAmount}</strong>
          </article>
          <article>
            <span>Pagado</span>
            <strong>{sale.formattedPaidAmount}</strong>
          </article>
          <article>
            <span>Saldo pendiente</span>
            <strong>{sale.formattedBalanceAmount}</strong>
          </article>
        </div>

        {sale.financialStatus !== "PAID" ? (
          <RegisterPaymentForm sale={sale} />
        ) : (
          <div className={styles.paidNotice}>
            Esta venta se encuentra pagada.
          </div>
        )}

        <section className={styles.paymentHistory}>
          <div className={styles.financeSectionHeader}>
            <div>
              <span className={styles.eyebrow}>Historial</span>
              <h3>Pagos registrados</h3>
            </div>
          </div>

          {sale.payments.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Aún no hay pagos</strong>
              <p>Registra el primer abono cuando el dinero sea recibido.</p>
            </div>
          ) : (
            sale.payments.map((payment, index) => (
              <article className={styles.paymentCard} key={payment.id}>
                <header>
                  <div>
                    <strong>
                      Abono {sale.payments.length - index} ·{" "}
                      {payment.formattedAmount}
                    </strong>
                    <span>
                      {payment.displayDate} · {payment.methodLabel}
                      {payment.reference
                        ? ` · Operación ${payment.reference}`
                        : ""}
                    </span>
                  </div>
                </header>

                <details className={styles.documentDisclosure}>
                  <summary>Recibo de pago</summary>
                  <ReceiptForm payment={payment} sale={sale} />
                </details>

                <details className={styles.documentDisclosure}>
                  <summary>Factura electrónica</summary>
                  <InvoiceForm payment={payment} sale={sale} />
                </details>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
