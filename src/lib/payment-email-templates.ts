type PaymentMethod =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

type ReceiptInput = {
  number: number;
  recipientName: string;
  serviceDescription: string;
  projectReference?: string | null;
  coveragePeriod?: string | null;
  paidAt: Date;
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceAmount: number;
};

type InvoiceInput = {
  invoiceNumber: string;
  recipientName: string;
  issueDate: Date;
  serviceDescription: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentCondition: string;
  fileName: string;
};

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function date(value: Date) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(value);
}

function method(
  value: PaymentMethod,
) {
  const labels: Record<
    PaymentMethod,
    string
  > = {
    BANK_TRANSFER:
      "Transferencia bancaria",
    FLOW: "Flow",
    CREDIT_CARD:
      "Tarjeta de crédito",
    DEBIT_CARD:
      "Tarjeta de débito",
    CASH: "Efectivo",
    OTHER: "Otro",
  };

  return labels[value];
}

function row(
  label: string,
  value: string,
  strong = false,
) {
  return `
    <tr>
      <td
        style="
          padding:7px 0;
          color:#101828;
          font-size:14px;
          line-height:1.35;
          vertical-align:top;
        "
      >
        <strong>${escapeHtml(label)}:</strong>
      </td>
      <td
        style="
          padding:7px 0 7px 14px;
          color:#101828;
          font-size:14px;
          font-weight:${strong ? "700" : "400"};
          line-height:1.35;
          vertical-align:top;
        "
      >
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

function layout({
  title,
  content,
  area,
}: {
  title: string;
  content: string;
  area: string;
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
        <title>${escapeHtml(title)}</title>
      </head>
      <body
        style="
          margin:0;
          padding:0;
          background:#f2f4f7;
          font-family:Arial,Helvetica,sans-serif;
          color:#101828;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="
            width:100%;
            padding:28px 14px;
            background:#f2f4f7;
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
                  max-width:680px;
                  overflow:hidden;
                  border:1px solid #e4e7ec;
                  border-radius:14px;
                  background:#ffffff;
                "
              >
                <tr>
                  <td
                    style="
                      padding:25px 30px;
                      background:#111827;
                      color:#ffffff;
                    "
                  >
                    <div
                      style="
                        color:#b2ccff;
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:.1em;
                        text-transform:uppercase;
                      "
                    >
                      ${escapeHtml(area)}
                    </div>
                    <div
                      style="
                        margin-top:7px;
                        font-size:22px;
                        font-weight:700;
                      "
                    >
                      ${escapeHtml(title)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td
                    style="
                      padding:30px;
                      font-size:14px;
                      line-height:1.6;
                    "
                  >
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td
                    style="
                      padding:20px 30px 26px;
                      border-top:1px solid #eaecf0;
                      color:#667085;
                      font-size:12px;
                      line-height:1.6;
                    "
                  >
                    Este correo fue generado
                    automáticamente por el
                    sistema de Vialoop.
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

export function buildPaymentReceiptEmail(
  input: ReceiptInput,
) {
  const number =
    String(input.number).padStart(
      4,
      "0",
    );

  const subject =
    `Recibo de pago N.º ${number} – ${input.serviceDescription}`;

  const project =
    input.projectReference
      ? row(
          "Dominio / proyecto",
          input.projectReference,
        )
      : "";

  const period =
    input.coveragePeriod
      ? row(
          "Período del servicio",
          input.coveragePeriod,
        )
      : "";

  const operation =
    input.paymentReference
      ? row(
          "N.º de orden / operación",
          input.paymentReference,
        )
      : "";

  const content = `
    <p style="margin:0 0 18px;">
      Estimado(a)
      <strong>${escapeHtml(input.recipientName)}</strong>:
    </p>

    <p style="margin:0 0 22px;">
      Confirmamos la recepción del pago correspondiente al siguiente servicio:
    </p>

    <div
      style="
        margin-bottom:22px;
        border:1px solid #eaecf0;
        border-radius:10px;
        background:#f9fafb;
        padding:16px 18px;
      "
    >
      <strong
        style="
          display:block;
          font-size:16px;
        "
      >
        ${escapeHtml(input.serviceDescription)}
      </strong>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="width:100%;"
    >
      ${project}
      ${period}
      ${row("Monto neto", money(input.netAmount))}
      ${row("IVA 19%", money(input.taxAmount))}
      ${row("Total pagado", money(input.totalAmount), true)}
      ${row("Saldo pendiente", money(input.balanceAmount), true)}
      ${row("Fecha del pago", date(input.paidAt))}
      ${row("Medio de pago", method(input.paymentMethod))}
      ${operation}
      ${row("Estado", "Pagado", true)}
    </table>

    <p
      style="
        margin:24px 0 0;
        color:#475467;
      "
    >
      Este recibo corresponde al respaldo del pago registrado.
      Para solicitar factura electrónica, responde este correo
      indicando RUT, razón social, dirección y giro, o escribe a
      <a
        href="mailto:facturacion@vialoop.cl"
        style="color:#175cd3;"
      >
        facturacion@vialoop.cl
      </a>.
    </p>

    <p style="margin:24px 0 0;">
      Saludos cordiales,<br />
      <strong>Pagos Vialoop</strong>
    </p>
  `;

  const text = [
    `Estimado(a) ${input.recipientName}:`,
    "",
    "Confirmamos la recepción del pago.",
    `Servicio: ${input.serviceDescription}`,
    input.projectReference
      ? `Dominio / proyecto: ${input.projectReference}`
      : null,
    input.coveragePeriod
      ? `Período: ${input.coveragePeriod}`
      : null,
    `Monto neto: ${money(input.netAmount)}`,
    `IVA 19%: ${money(input.taxAmount)}`,
    `Total pagado: ${money(input.totalAmount)}`,
    `Saldo pendiente: ${money(input.balanceAmount)}`,
    `Fecha: ${date(input.paidAt)}`,
    `Medio de pago: ${method(input.paymentMethod)}`,
    input.paymentReference
      ? `N.º de orden / operación: ${input.paymentReference}`
      : null,
    "Estado: Pagado",
    "",
    "Para solicitar factura electrónica, escribe a facturacion@vialoop.cl.",
    "",
    "Pagos Vialoop",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: layout({
      title:
        `Recibo de pago N.º ${number}`,
      content,
      area: "Pagos Vialoop",
    }),
  };
}

export function buildInvoiceEmail(
  input: InvoiceInput,
) {
  const subject =
    `Emisión de factura N.º ${input.invoiceNumber} – ${input.serviceDescription}`;

  const content = `
    <p style="margin:0 0 18px;">
      Estimado(a)
      <strong>${escapeHtml(input.recipientName)}</strong>:
    </p>

    <p style="margin:0 0 22px;">
      Informamos que se ha emitido la factura correspondiente al servicio indicado a continuación.
    </p>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="width:100%;"
    >
      ${row("Factura electrónica N.º", input.invoiceNumber, true)}
      ${row("Servicio", input.serviceDescription)}
      ${row("Monto neto", money(input.netAmount))}
      ${row("IVA 19%", money(input.taxAmount))}
      ${row("Total", money(input.totalAmount), true)}
      ${row("Forma de pago", input.paymentCondition)}
      ${row("Fecha de emisión", date(input.issueDate))}
    </table>

    <div
      style="
        margin-top:22px;
        border-left:3px solid #175cd3;
        background:#f5f8ff;
        padding:14px 16px;
        color:#344054;
      "
    >
      La factura electrónica
      <strong>${escapeHtml(input.fileName)}</strong>
      se encuentra adjunta a este correo.
    </div>

    <p style="margin:24px 0 0;">
      Saludos cordiales,<br /><br />
      <strong>Área de Facturación</strong><br />
      Vialoop Studio SpA<br />
      <a
        href="mailto:facturacion@vialoop.cl"
        style="color:#175cd3;"
      >
        facturacion@vialoop.cl
      </a><br />
      <a
        href="https://www.vialoop.cl"
        style="color:#175cd3;"
      >
        www.vialoop.cl
      </a>
    </p>
  `;

  const text = [
    `Estimado(a) ${input.recipientName}:`,
    "",
    "Informamos que se ha emitido la factura correspondiente.",
    `Factura electrónica N.º: ${input.invoiceNumber}`,
    `Servicio: ${input.serviceDescription}`,
    `Monto neto: ${money(input.netAmount)}`,
    `IVA 19%: ${money(input.taxAmount)}`,
    `Total: ${money(input.totalAmount)}`,
    `Forma de pago: ${input.paymentCondition}`,
    `Fecha de emisión: ${date(input.issueDate)}`,
    "",
    `La factura ${input.fileName} se encuentra adjunta.`,
    "",
    "Área de Facturación",
    "Vialoop Studio SpA",
    "facturacion@vialoop.cl",
    "www.vialoop.cl",
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      title:
        `Factura N.º ${input.invoiceNumber}`,
      content,
      area:
        "Facturación Vialoop",
    }),
  };
}
