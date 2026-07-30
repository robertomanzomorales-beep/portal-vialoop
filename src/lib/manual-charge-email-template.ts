type ManualChargeEmailInput = {
  chargeNumber: number;
  recipientName: string;
  clientName: string;
  concept: string;
  amount: number;
  dueDate: Date | null;
  paymentUrl: string | null;
  message: string | null;
};

const BANK_ACCOUNT = {
  holder: "Vialoop Studio SpA",
  rut: "78.455.385-K",
  bank: "Mercado Pago",
  accountType: "Cuenta Vista",
  accountNumber: "1038393364",
  email: "rmanzo@vialoop.cl",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(value);
}

export function buildManualChargeEmail(input: ManualChargeEmailInput) {
  const number = String(input.chargeNumber).padStart(4, "0");
  const subject = `Solicitud de pago N.º ${number} – ${input.concept}`;
  const dueDateText = input.dueDate ? date(input.dueDate) : null;
  const customMessage = input.message
    ? `
      <p style="margin:0 0 22px;color:#475467;">
        ${escapeHtml(input.message).replaceAll("\n", "<br />")}
      </p>
    `
    : "";
  const flowButton = input.paymentUrl
    ? `
      <a
        href="${escapeHtml(input.paymentUrl)}"
        target="_blank"
        style="
          display:inline-block;
          margin:4px 0 24px;
          padding:14px 22px;
          border-radius:9px;
          background:#175cd3;
          color:#ffffff;
          font-size:14px;
          font-weight:700;
          text-decoration:none;
        "
      >
        Pagar en línea con Flow
      </a>
    `
    : "";

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;padding:28px 14px;background:#f2f4f7;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:680px;overflow:hidden;border:1px solid #e4e7ec;border-radius:14px;background:#ffffff;">
                <tr>
                  <td style="padding:25px 30px;background:#111827;color:#ffffff;">
                    <div style="color:#b2ccff;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">
                      Pagos Vialoop
                    </div>
                    <div style="margin-top:7px;font-size:22px;font-weight:700;">
                      Solicitud de pago
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px;font-size:14px;line-height:1.6;">
                    <p style="margin:0 0 18px;">
                      Estimado(a) <strong>${escapeHtml(input.recipientName)}</strong>:
                    </p>
                    <p style="margin:0 0 22px;">
                      Junto con saludar, enviamos el detalle del pago pendiente asociado a
                      <strong>${escapeHtml(input.clientName)}</strong>.
                    </p>
                    ${customMessage}
                    <div style="margin-bottom:22px;border:1px solid #eaecf0;border-radius:10px;background:#f9fafb;padding:18px;">
                      <div style="color:#667085;font-size:12px;font-weight:700;text-transform:uppercase;">
                        Concepto
                      </div>
                      <strong style="display:block;margin-top:6px;font-size:16px;">
                        ${escapeHtml(input.concept)}
                      </strong>
                      <div style="margin-top:16px;color:#667085;font-size:12px;font-weight:700;text-transform:uppercase;">
                        Monto a pagar
                      </div>
                      <strong style="display:block;margin-top:6px;color:#175cd3;font-size:25px;">
                        ${escapeHtml(money(input.amount))}
                      </strong>
                      ${
                        dueDateText
                          ? `<div style="margin-top:12px;color:#475467;">Fecha límite informativa: <strong>${escapeHtml(dueDateText)}</strong></div>`
                          : ""
                      }
                    </div>
                    ${flowButton}
                    <p style="margin:0 0 12px;font-weight:700;">
                      También puedes realizar una transferencia bancaria:
                    </p>
                    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:5px 0;color:#667085;">Titular</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.holder}</td></tr>
                      <tr><td style="padding:5px 0;color:#667085;">RUT</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.rut}</td></tr>
                      <tr><td style="padding:5px 0;color:#667085;">Banco</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.bank}</td></tr>
                      <tr><td style="padding:5px 0;color:#667085;">Tipo de cuenta</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.accountType}</td></tr>
                      <tr><td style="padding:5px 0;color:#667085;">N.º de cuenta</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.accountNumber}</td></tr>
                      <tr><td style="padding:5px 0;color:#667085;">Correo</td><td style="padding:5px 0;font-weight:700;">${BANK_ACCOUNT.email}</td></tr>
                    </table>
                    <p style="margin:24px 0 0;color:#475467;">
                      Si realizas una transferencia, responde este correo adjuntando el comprobante.
                    </p>
                    <p style="margin:24px 0 0;">
                      Saludos cordiales,<br />
                      <strong>Pagos Vialoop</strong>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 30px 26px;border-top:1px solid #eaecf0;color:#667085;font-size:12px;line-height:1.6;">
                    Cobro manual generado por Vialoop Studio SpA.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    `Estimado(a) ${input.recipientName}:`,
    "",
    `Solicitud de pago N.º ${number}`,
    `Cliente: ${input.clientName}`,
    `Concepto: ${input.concept}`,
    `Monto a pagar: ${money(input.amount)}`,
    dueDateText ? `Fecha límite informativa: ${dueDateText}` : null,
    input.message || null,
    "",
    input.paymentUrl ? "Pagar en línea con Flow:" : null,
    input.paymentUrl,
    input.paymentUrl ? "" : null,
    "Datos para transferencia:",
    BANK_ACCOUNT.holder,
    `RUT: ${BANK_ACCOUNT.rut}`,
    `Banco: ${BANK_ACCOUNT.bank}`,
    `Tipo de cuenta: ${BANK_ACCOUNT.accountType}`,
    `N.º de cuenta: ${BANK_ACCOUNT.accountNumber}`,
    `Correo: ${BANK_ACCOUNT.email}`,
    "",
    "Si realizas una transferencia, responde este correo adjuntando el comprobante.",
    "",
    "Saludos cordiales,",
    "Pagos Vialoop",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject,
    text,
    html,
  };
}
