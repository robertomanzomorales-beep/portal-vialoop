type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

type ReceiptEmailInput = {
  number: number;
  recipientName: string;
  serviceDescription: string;
  projectReference?: string | null;
  coveragePeriod?: string | null;
  paidAt: Date;
  paymentMethod: PaymentMethodValue;
  paymentReference?: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
};

type InvoiceEmailInput = {
  invoiceNumber: string;
  recipientName: string;
  issueDate: Date;
  serviceDescription: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  fileName: string;
};

const paymentMethodLabels: Record<
  PaymentMethodValue,
  string
> = {
  BANK_TRANSFER: "Transferencia bancaria",
  FLOW: "Flow",
  CREDIT_CARD: "Tarjeta de crédito",
  DEBIT_CARD: "Tarjeta de débito",
  CASH: "Efectivo",
  OTHER: "Otro",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Santiago",
    },
  ).format(value);
}

function getOptionalValue(
  value?: string | null,
) {
  const normalized =
    value?.trim();

  return normalized &&
    normalized.length > 0
    ? normalized
    : "No informado";
}

function buildDetailRow(
  label: string,
  value: string,
) {
  return `
    <tr>
      <td
        style="
          width:42%;
          padding:12px 0;
          border-bottom:1px solid #e7ebf0;
          color:#667085;
          font-size:14px;
          vertical-align:top;
        "
      >
        ${escapeHtml(label)}
      </td>

      <td
        style="
          padding:12px 0;
          border-bottom:1px solid #e7ebf0;
          color:#18212f;
          font-size:14px;
          font-weight:600;
          text-align:right;
          vertical-align:top;
        "
      >
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

function buildAmountRow(
  label: string,
  value: number,
  highlighted = false,
) {
  return `
    <tr>
      <td
        style="
          padding:
            ${highlighted
              ? "16px 18px"
              : "10px 18px"};
          color:
            ${highlighted
              ? "#ffffff"
              : "#667085"};
          background:
            ${highlighted
              ? "#172033"
              : "#f7f8fa"};
          font-size:
            ${highlighted
              ? "15px"
              : "14px"};
          font-weight:
            ${highlighted
              ? "700"
              : "500"};
        "
      >
        ${escapeHtml(label)}
      </td>

      <td
        style="
          padding:
            ${highlighted
              ? "16px 18px"
              : "10px 18px"};
          color:
            ${highlighted
              ? "#ffffff"
              : "#18212f"};
          background:
            ${highlighted
              ? "#172033"
              : "#f7f8fa"};
          font-size:
            ${highlighted
              ? "18px"
              : "14px"};
          font-weight:700;
          text-align:right;
        "
      >
        ${escapeHtml(
          formatCurrency(value),
        )}
      </td>
    </tr>
  `;
}

function buildCorporateEmail({
  eyebrow,
  title,
  introduction,
  content,
  footerNote,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  content: string;
  footerNote: string;
}) {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          ${escapeHtml(title)}
        </title>
      </head>

      <body
        style="
          margin:0;
          padding:0;
          background:#eef1f5;
          font-family:Arial,Helvetica,sans-serif;
          color:#18212f;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="
            width:100%;
            background:#eef1f5;
            padding:32px 16px;
          "
        >
          <tr>
            <td align="center">
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="
                  width:100%;
                  max-width:640px;
                  background:#ffffff;
                  border:1px solid #dde2e8;
                  border-radius:14px;
                  overflow:hidden;
                "
              >
                <tr>
                  <td
                    style="
                      height:5px;
                      background:#ef7d00;
                      font-size:0;
                      line-height:0;
                    "
                  >
                    &nbsp;
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:28px 32px;
                      background:#172033;
                      color:#ffffff;
                    "
                  >
                    <div
                      style="
                        font-size:24px;
                        font-weight:800;
                        letter-spacing:-0.6px;
                      "
                    >
                      VIALOOP
                    </div>

                    <div
                      style="
                        margin-top:5px;
                        font-size:12px;
                        color:#cbd2dc;
                        letter-spacing:0.7px;
                        text-transform:uppercase;
                      "
                    >
                      Vialoop Studio SpA
                    </div>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:34px 32px 16px;
                    "
                  >
                    <div
                      style="
                        margin-bottom:10px;
                        color:#ef7d00;
                        font-size:12px;
                        font-weight:700;
                        letter-spacing:0.9px;
                        text-transform:uppercase;
                      "
                    >
                      ${escapeHtml(eyebrow)}
                    </div>

                    <h1
                      style="
                        margin:0;
                        color:#172033;
                        font-size:27px;
                        line-height:1.2;
                        letter-spacing:-0.6px;
                      "
                    >
                      ${escapeHtml(title)}
                    </h1>

                    <p
                      style="
                        margin:18px 0 0;
                        color:#475467;
                        font-size:15px;
                        line-height:1.7;
                      "
                    >
                      ${escapeHtml(
                        introduction,
                      )}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:14px 32px 34px;
                    "
                  >
                    ${content}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:24px 32px;
                      background:#f7f8fa;
                      border-top:1px solid #e7ebf0;
                      color:#667085;
                      font-size:12px;
                      line-height:1.65;
                    "
                  >
                    ${escapeHtml(footerNote)}

                    <br />
                    <br />

                    Para consultas, responde directamente a este correo.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function buildPaymentReceiptEmail({
  number,
  recipientName,
  serviceDescription,
  projectReference,
  coveragePeriod,
  paidAt,
  paymentMethod,
  paymentReference,
  netAmount,
  taxAmount,
  totalAmount,
}: ReceiptEmailInput) {
  const formattedNumber =
    String(number).padStart(
      3,
      "0",
    );

  const subject =
    `Confirmación de pago N.º ${formattedNumber} | Vialoop`;

  const methodLabel =
    paymentMethodLabels[
      paymentMethod
    ];

  const content = `
    <div
      style="
        margin-bottom:22px;
        padding:18px 20px;
        background:#fff7ed;
        border:1px solid #fed7aa;
        border-radius:10px;
      "
    >
      <div
        style="
          color:#9a4d00;
          font-size:12px;
          font-weight:700;
          letter-spacing:0.6px;
          text-transform:uppercase;
        "
      >
        Comprobante interno
      </div>

      <div
        style="
          margin-top:5px;
          color:#172033;
          font-size:22px;
          font-weight:800;
        "
      >
        Pago N.º ${escapeHtml(
          formattedNumber,
        )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        margin-bottom:24px;
      "
    >
      ${buildDetailRow(
        "Cliente",
        recipientName,
      )}

      ${buildDetailRow(
        "Servicio",
        serviceDescription,
      )}

      ${buildDetailRow(
        "Proyecto o referencia",
        getOptionalValue(
          projectReference,
        ),
      )}

      ${buildDetailRow(
        "Periodo de cobertura",
        getOptionalValue(
          coveragePeriod,
        ),
      )}

      ${buildDetailRow(
        "Fecha de pago",
        formatDate(paidAt),
      )}

      ${buildDetailRow(
        "Medio de pago",
        methodLabel,
      )}

      ${buildDetailRow(
        "Número de operación",
        getOptionalValue(
          paymentReference,
        ),
      )}
    </table>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        overflow:hidden;
        border:1px solid #e3e7ed;
        border-radius:10px;
      "
    >
      ${buildAmountRow(
        "Monto neto",
        netAmount,
      )}

      ${buildAmountRow(
        "IVA 19%",
        taxAmount,
      )}

      ${buildAmountRow(
        "Total recibido",
        totalAmount,
        true,
      )}
    </table>
  `;

  const html =
    buildCorporateEmail({
      eyebrow:
        "Pago confirmado",

      title:
        "Confirmación de pago recibido",

      introduction:
        `Estimado(a) ${recipientName}, confirmamos que el pago asociado al servicio indicado fue recibido y registrado correctamente.`,

      content,

      footerNote:
        "Este comprobante corresponde a una confirmación de pago emitida por Vialoop Studio SpA y no reemplaza una factura u otro documento tributario.",
    });

  const text = [
    "VIALOOP STUDIO SpA",
    "",
    `CONFIRMACIÓN DE PAGO N.º ${formattedNumber}`,
    "",
    `Estimado(a) ${recipientName}:`,
    "",
    "Confirmamos que el pago fue recibido y registrado correctamente.",
    "",
    `Cliente: ${recipientName}`,
    `Servicio: ${serviceDescription}`,
    `Proyecto o referencia: ${getOptionalValue(projectReference)}`,
    `Periodo de cobertura: ${getOptionalValue(coveragePeriod)}`,
    `Fecha de pago: ${formatDate(paidAt)}`,
    `Medio de pago: ${methodLabel}`,
    `Número de operación: ${getOptionalValue(paymentReference)}`,
    "",
    `Monto neto: ${formatCurrency(netAmount)}`,
    `IVA 19%: ${formatCurrency(taxAmount)}`,
    `Total recibido: ${formatCurrency(totalAmount)}`,
    "",
    "Este comprobante no reemplaza una factura u otro documento tributario.",
  ].join("\n");

  return {
    subject,
    text,
    html,
  };
}

export function buildInvoiceEmail({
  invoiceNumber,
  recipientName,
  issueDate,
  serviceDescription,
  netAmount,
  taxAmount,
  totalAmount,
  fileName,
}: InvoiceEmailInput) {
  const subject =
    `Factura N.º ${invoiceNumber} | Vialoop Studio SpA`;

  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:18px 20px;
        background:#f7f8fa;
        border:1px solid #e3e7ed;
        border-radius:10px;
      "
    >
      <div
        style="
          color:#667085;
          font-size:12px;
          font-weight:700;
          letter-spacing:0.6px;
          text-transform:uppercase;
        "
      >
        Documento tributario
      </div>

      <div
        style="
          margin-top:5px;
          color:#172033;
          font-size:22px;
          font-weight:800;
        "
      >
        Factura N.º ${escapeHtml(
          invoiceNumber,
        )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        margin-bottom:24px;
      "
    >
      ${buildDetailRow(
        "Cliente",
        recipientName,
      )}

      ${buildDetailRow(
        "Fecha de emisión",
        formatDate(issueDate),
      )}

      ${buildDetailRow(
        "Servicio",
        serviceDescription,
      )}
    </table>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        margin-bottom:24px;
        border-collapse:separate;
        border-spacing:0;
        overflow:hidden;
        border:1px solid #e3e7ed;
        border-radius:10px;
      "
    >
      ${buildAmountRow(
        "Monto neto",
        netAmount,
      )}

      ${buildAmountRow(
        "IVA 19%",
        taxAmount,
      )}

      ${buildAmountRow(
        "Total factura",
        totalAmount,
        true,
      )}
    </table>

    <div
      style="
        padding:16px 18px;
        background:#fff7ed;
        border-left:4px solid #ef7d00;
        color:#7c3e00;
        font-size:14px;
        line-height:1.6;
      "
    >
      La factura se encuentra adjunta en formato PDF:

      <strong>
        ${escapeHtml(fileName)}
      </strong>
    </div>
  `;

  const html =
    buildCorporateEmail({
      eyebrow:
        "Facturación",

      title:
        "Factura adjunta",

      introduction:
        `Estimado(a) ${recipientName}, junto con saludar, enviamos la factura correspondiente al servicio indicado.`,

      content,

      footerNote:
        "Documento enviado por el área de Facturación de Vialoop Studio SpA.",
    });

  const text = [
    "VIALOOP STUDIO SpA",
    "",
    `FACTURA N.º ${invoiceNumber}`,
    "",
    `Estimado(a) ${recipientName}:`,
    "",
    "Junto con saludar, enviamos la factura correspondiente al servicio indicado.",
    "",
    `Fecha de emisión: ${formatDate(issueDate)}`,
    `Servicio: ${serviceDescription}`,
    `Monto neto: ${formatCurrency(netAmount)}`,
    `IVA 19%: ${formatCurrency(taxAmount)}`,
    `Total factura: ${formatCurrency(totalAmount)}`,
    "",
    `Documento adjunto: ${fileName}`,
  ].join("\n");

  return {
    subject,
    text,
    html,
  };
}