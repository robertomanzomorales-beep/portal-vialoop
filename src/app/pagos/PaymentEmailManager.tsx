"use client";

import { useFormStatus } from "react-dom";
import {
  resendPaymentInvoice,
  resendPaymentReceipt,
  sendPaymentReceipt,
  uploadAndSendPaymentInvoice,
} from "./actions";
import styles from "./pagos.module.css";

type EmailStatus =
  | "PENDING"
  | "SENT"
  | "FAILED";

type ReceiptData = {
  number: number;
  recipientName: string;
  recipientEmail: string;
  serviceDescription: string;
  projectReference:
    | string
    | null;
  coveragePeriod:
    | string
    | null;
  paymentReference:
    | string
    | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceAmount: number;
  emailStatus: EmailStatus;
  lastError:
    | string
    | null;
};

type InvoiceData = {
  invoiceNumber: string;
  issueDate: string;
  recipientName: string;
  recipientEmail: string;
  serviceDescription: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentCondition:
    | string
    | null;
  fileName: string;
  emailStatus: EmailStatus;
  lastError:
    | string
    | null;
};

type Props = {
  paymentId: string;
  clientName: string;
  clientEmail:
    | string
    | null;
  description: string;
  amount: number;
  paidAt:
    | string
    | null;
  paymentMethod:
    | string
    | null;
  receipt:
    | ReceiptData
    | null;
  invoice:
    | InvoiceData
    | null;
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

function calculatedAmounts(
  total: number,
) {
  const net =
    Math.round(total / 1.19);

  return {
    net,
    tax: total - net,
  };
}

function SubmitButton({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } =
    useFormStatus();

  return (
    <button
      className={
        styles.emailSubmitButton
      }
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Enviando..."
        : children}
    </button>
  );
}

function Status({
  value,
}: {
  value: EmailStatus;
}) {
  return (
    <span
      className={`${styles.emailStatus} ${
        value === "SENT"
          ? styles.emailSent
          : value === "FAILED"
            ? styles.emailFailed
            : styles.emailPending
      }`}
    >
      {value === "SENT"
        ? "Enviado"
        : value === "FAILED"
          ? "Error de envío"
          : "Pendiente"}
    </span>
  );
}

export default function PaymentEmailManager({
  paymentId,
  clientName,
  clientEmail,
  description,
  amount,
  paidAt,
  paymentMethod,
  receipt,
  invoice,
}: Props) {
  const defaults =
    calculatedAmounts(amount);

  const sendReceiptAction =
    sendPaymentReceipt.bind(
      null,
      paymentId,
    );

  const resendReceiptAction =
    resendPaymentReceipt.bind(
      null,
      paymentId,
    );

  const sendInvoiceAction =
    uploadAndSendPaymentInvoice.bind(
      null,
      paymentId,
    );

  const resendInvoiceAction =
    resendPaymentInvoice.bind(
      null,
      paymentId,
    );

  return (
    <details
      className={
        styles.emailManager
      }
    >
      <summary
        className={
          styles.emailManagerToggle
        }
      >
        Correos
      </summary>

      <div
        className={
          styles.emailManagerPanel
        }
      >
        <section
          className={
            styles.emailCard
          }
        >
          <header
            className={
              styles.emailCardHeader
            }
          >
            <div>
              <span>
                pagos@vialoop.cl
              </span>
              <h3>
                Confirmación de pago
              </h3>
            </div>

            {receipt && (
              <Status
                value={
                  receipt.emailStatus
                }
              />
            )}
          </header>

          <form
            action={
              sendReceiptAction
            }
            className={
              styles.emailForm
            }
          >
            <div
              className={
                styles.emailFormGrid
              }
            >
              <label>
                <span>
                  Nombre del cliente
                </span>
                <input
                  defaultValue={
                    receipt?.recipientName ??
                    clientName
                  }
                  name="receiptRecipientName"
                  required
                  type="text"
                />
              </label>

              <label>
                <span>
                  Correo del cliente
                </span>
                <input
                  defaultValue={
                    receipt?.recipientEmail ??
                    clientEmail ??
                    ""
                  }
                  name="receiptRecipientEmail"
                  required
                  type="email"
                />
              </label>

              <label
                className={
                  styles.emailFullWidth
                }
              >
                <span>
                  Servicio pagado
                </span>
                <input
                  defaultValue={
                    receipt?.serviceDescription ??
                    description
                  }
                  name="receiptServiceDescription"
                  required
                  type="text"
                />
              </label>

              <label>
                <span>
                  Dominio o proyecto
                </span>
                <input
                  defaultValue={
                    receipt?.projectReference ??
                    ""
                  }
                  name="receiptProjectReference"
                  placeholder="Ej. empresa.cl"
                  type="text"
                />
              </label>

              <label>
                <span>
                  Período del servicio
                </span>
                <input
                  defaultValue={
                    receipt?.coveragePeriod ??
                    ""
                  }
                  name="receiptCoveragePeriod"
                  placeholder="Ej. 29-07-2026 al 28-07-2027"
                  type="text"
                />
              </label>

              <label>
                <span>
                  Monto neto
                </span>
                <input
                  defaultValue={
                    receipt?.netAmount ??
                    defaults.net
                  }
                  min="0"
                  name="receiptNetAmount"
                  required
                  step="1"
                  type="number"
                />
              </label>

              <label>
                <span>IVA 19%</span>
                <input
                  defaultValue={
                    receipt?.taxAmount ??
                    defaults.tax
                  }
                  min="0"
                  name="receiptTaxAmount"
                  required
                  step="1"
                  type="number"
                />
              </label>

              <label>
                <span>
                  Total pagado
                </span>
                <input
                  defaultValue={
                    receipt?.totalAmount ??
                    amount
                  }
                  min="1"
                  name="receiptTotalAmount"
                  required
                  step="1"
                  type="number"
                />
              </label>

              <label>
                <span>
                  Saldo pendiente
                </span>
                <input
                  defaultValue={
                    receipt?.balanceAmount ??
                    0
                  }
                  min="0"
                  name="receiptBalanceAmount"
                  required
                  step="1"
                  type="number"
                />
              </label>

              <label>
                <span>
                  Fecha del pago
                </span>
                <input
                  defaultValue={
                    paidAt ?? today()
                  }
                  name="paidAt"
                  required
                  type="date"
                />
              </label>

              <label>
                <span>
                  Medio de pago
                </span>
                <select
                  defaultValue={
                    paymentMethod ??
                    "BANK_TRANSFER"
                  }
                  name="paymentMethod"
                >
                  <option value="BANK_TRANSFER">
                    Transferencia bancaria
                  </option>
                  <option value="FLOW">
                    Flow
                  </option>
                  <option value="CREDIT_CARD">
                    Tarjeta de crédito
                  </option>
                  <option value="DEBIT_CARD">
                    Tarjeta de débito
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
                  styles.emailFullWidth
                }
              >
                <span>
                  N.º de orden u operación
                </span>
                <input
                  defaultValue={
                    receipt?.paymentReference ??
                    ""
                  }
                  name="paymentReference"
                  placeholder="Ej. 175988973"
                  type="text"
                />
              </label>
            </div>

            {receipt?.lastError && (
              <p
                className={
                  styles.emailError
                }
              >
                Error SMTP:{" "}
                {receipt.lastError}
              </p>
            )}

            <div
              className={
                styles.emailFormFooter
              }
            >
              <SubmitButton>
                {receipt
                  ? "Guardar y enviar nuevamente"
                  : "Crear y enviar recibo"}
              </SubmitButton>
            </div>
          </form>

          {receipt && (
            <form
              action={
                resendReceiptAction
              }
            >
              <button
                className={
                  styles.emailSecondaryButton
                }
                type="submit"
              >
                Reenviar sin modificar
              </button>
            </form>
          )}
        </section>

        <section
          className={
            styles.emailCard
          }
        >
          <header
            className={
              styles.emailCardHeader
            }
          >
            <div>
              <span>
                facturacion@vialoop.cl
              </span>
              <h3>
                Envío de factura
              </h3>
            </div>

            {invoice && (
              <Status
                value={
                  invoice.emailStatus
                }
              />
            )}
          </header>

          {invoice ? (
            <div
              className={
                styles.invoiceExisting
              }
            >
              <strong>
                Factura N.º{" "}
                {
                  invoice.invoiceNumber
                }
              </strong>
              <span>
                {invoice.fileName} ·{" "}
                {
                  invoice.recipientEmail
                }
              </span>

              {invoice.lastError && (
                <p
                  className={
                    styles.emailError
                  }
                >
                  Error SMTP:{" "}
                  {invoice.lastError}
                </p>
              )}

              <form
                action={
                  resendInvoiceAction
                }
              >
                <SubmitButton>
                  Reenviar factura
                </SubmitButton>
              </form>
            </div>
          ) : (
            <form
              action={
                sendInvoiceAction
              }
              className={
                styles.emailForm
              }
              encType="multipart/form-data"
            >
              <div
                className={
                  styles.emailFormGrid
                }
              >
                <label>
                  <span>
                    Número de factura
                  </span>
                  <input
                    name="invoiceNumber"
                    placeholder="Ej. 4"
                    required
                    type="text"
                  />
                </label>

                <label>
                  <span>
                    Fecha de emisión
                  </span>
                  <input
                    defaultValue={today()}
                    name="invoiceIssueDate"
                    required
                    type="date"
                  />
                </label>

                <label>
                  <span>
                    Nombre del cliente
                  </span>
                  <input
                    defaultValue={
                      clientName
                    }
                    name="invoiceRecipientName"
                    required
                    type="text"
                  />
                </label>

                <label>
                  <span>
                    Correo del cliente
                  </span>
                  <input
                    defaultValue={
                      clientEmail ??
                      ""
                    }
                    name="invoiceRecipientEmail"
                    required
                    type="email"
                  />
                </label>

                <label
                  className={
                    styles.emailFullWidth
                  }
                >
                  <span>
                    Servicio facturado
                  </span>
                  <input
                    defaultValue={
                      description
                    }
                    name="invoiceServiceDescription"
                    required
                    type="text"
                  />
                </label>

                <label>
                  <span>
                    Monto neto
                  </span>
                  <input
                    defaultValue={
                      defaults.net
                    }
                    min="0"
                    name="invoiceNetAmount"
                    required
                    step="1"
                    type="number"
                  />
                </label>

                <label>
                  <span>IVA 19%</span>
                  <input
                    defaultValue={
                      defaults.tax
                    }
                    min="0"
                    name="invoiceTaxAmount"
                    required
                    step="1"
                    type="number"
                  />
                </label>

                <label>
                  <span>Total</span>
                  <input
                    defaultValue={amount}
                    min="1"
                    name="invoiceTotalAmount"
                    required
                    step="1"
                    type="number"
                  />
                </label>

                <label>
                  <span>
                    Forma de pago
                  </span>
                  <input
                    defaultValue="Contado"
                    name="invoicePaymentCondition"
                    required
                    type="text"
                  />
                </label>

                <label
                  className={
                    styles.emailFullWidth
                  }
                >
                  <span>
                    Factura PDF
                  </span>
                  <input
                    accept="application/pdf,.pdf"
                    className={
                      styles.documentFile
                    }
                    name="invoiceFile"
                    required
                    type="file"
                  />
                </label>
              </div>

              <div
                className={
                  styles.emailFormFooter
                }
              >
                <SubmitButton>
                  Adjuntar y enviar factura
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </details>
  );
}
