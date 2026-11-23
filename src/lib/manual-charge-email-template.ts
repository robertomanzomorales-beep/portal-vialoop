import { buildVialoopEmailLayout } from "@/lib/vialoop-email";
import { VIALOOP_PAYMENT_DETAILS } from "@/lib/vialoop-payment-details";

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
  holder: VIALOOP_PAYMENT_DETAILS.holder,
  rut: VIALOOP_PAYMENT_DETAILS.taxId,
  bank: VIALOOP_PAYMENT_DETAILS.institution,
  accountType: VIALOOP_PAYMENT_DETAILS.accountType,
  accountNumber: VIALOOP_PAYMENT_DETAILS.accountNumber,
  email: VIALOOP_PAYMENT_DETAILS.email,
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
      <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.65;">
        ${escapeHtml(input.message).replaceAll("\n", "<br />")}
      </p>
    `
    : "";
  const flowButton = input.paymentUrl
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:16px 0 18px;border-collapse:collapse;">
        <tr>
          <td align="left">
            <a href="${escapeHtml(input.paymentUrl)}" target="_blank" style="display:inline-block;border-radius:7px;background:#245bd6;padding:11px 16px;color:#ffffff;font-size:12px;font-weight:750;text-decoration:none;">Acceder a Flow · hasta 3 cuotas</a>
            <div style="margin-top:7px;color:#64748b;font-size:10px;line-height:1.5;">La disponibilidad y condiciones de las cuotas dependen de la tarjeta y su emisor.</div>
          </td>
        </tr>
      </table>
    `
    : "";

  const content = `
    <p style="margin:0 0 8px;color:#172033;font-size:14px;font-weight:700;line-height:1.55;">Estimado(a) ${escapeHtml(input.recipientName)}:</p>
    <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.65;">Enviamos el detalle del pago pendiente asociado a <strong style="color:#172033;">${escapeHtml(input.clientName)}</strong>.</p>
    ${customMessage}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #dfe6ee;border-collapse:collapse;background:#ffffff;">
      <tr>
        <td style="padding:10px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Concepto</td>
        <td align="right" style="padding:10px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:750;">${escapeHtml(input.concept)}</td>
      </tr>
      <tr>
        <td style="padding:12px 13px;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Total a pagar</td>
        <td align="right" style="padding:12px 13px;color:#245bd6;font-size:20px;font-weight:800;">${escapeHtml(money(input.amount))}</td>
      </tr>
      ${
        dueDateText
          ? `<tr><td style="padding:9px 13px;border-top:1px solid #edf1f5;color:#64748b;font-size:11px;">Fecha límite</td><td align="right" style="padding:9px 13px;border-top:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(dueDateText)}</td></tr>`
          : ""
      }
    </table>

    ${flowButton}

    <div style="margin:0 0 15px;color:#172033;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Transferencia bancaria</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-top:1px solid #e5eaf0;border-collapse:collapse;">
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Titular</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${BANK_ACCOUNT.holder}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">RUT</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${BANK_ACCOUNT.rut}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Banco / tipo</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${BANK_ACCOUNT.bank} · ${BANK_ACCOUNT.accountType}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">N.º de cuenta</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${BANK_ACCOUNT.accountNumber}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;font-size:11px;">Correo</td><td align="right" style="padding:7px 0;color:#172033;font-size:11px;font-weight:700;">${BANK_ACCOUNT.email}</td></tr>
    </table>

    <p style="margin:16px 0 0;color:#475569;font-size:12px;line-height:1.6;">Si realizas una transferencia, responde este correo adjuntando el comprobante.</p>
    <p style="margin:17px 0 0;padding-top:13px;border-top:1px solid #e5eaf0;color:#475569;font-size:12px;line-height:1.55;">Saludos cordiales,<br /><strong style="color:#172033;">Pagos Vialoop</strong></p>
  `;

  const html = buildVialoopEmailLayout({
    eyebrow: "Pagos Vialoop",
    title: `Solicitud de pago N.º ${number}`,
    reference: "Pago pendiente",
    preheader: `${input.clientName} · ${input.concept} · ${money(input.amount)}`,
    content,
    footer:
      "Vialoop Studio SpA · vialoop.cl<br />Cobro emitido y registrado desde el Portal Vialoop.",
  });

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
    input.paymentUrl ? "Pagar con Flow (hasta 3 cuotas, sujeto a condiciones del emisor):" : null,
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
