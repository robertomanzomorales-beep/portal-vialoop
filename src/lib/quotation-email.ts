import type { QuotationMetadata } from "@/lib/quotation";
import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
} from "@/lib/vialoop-email";
import { VIALOOP_PAYMENT_DETAILS } from "@/lib/vialoop-payment-details";

function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function serviceRows(quotation: QuotationMetadata) {
  return quotation.items
    .map((item, index) => {
      const detail = item.detail
        ? `<div style="max-width:410px;margin-top:3px;color:#64748b;font-size:11px;line-height:1.5;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";

      return `
        <tr>
          <td class="quote-item-copy" valign="top" style="padding:11px 13px;${index > 0 ? "border-top:1px solid #e5eaf0;" : ""}">
            <div style="margin-bottom:3px;color:#2f6fed;font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">${String(index + 1).padStart(2, "0")} · Servicio</div>
            <div style="color:#172033;font-size:13px;font-weight:750;line-height:1.4;">${escapeEmailHtml(item.description)}</div>
            ${detail}
          </td>
          <td class="quote-item-value" align="right" valign="top" width="150" style="width:150px;padding:11px 13px 11px 8px;${index > 0 ? "border-top:1px solid #e5eaf0;" : ""}color:#172033;font-size:12px;font-weight:750;line-height:1.4;white-space:nowrap;">
            ${escapeEmailHtml(money(item.quantity * item.unitPrice))}
            <span style="display:block;margin-top:3px;color:#64748b;font-size:9px;font-weight:400;">${item.quantity} × ${escapeEmailHtml(money(item.unitPrice))}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function buildQuotationEmail(quotation: QuotationMetadata) {
  const project = quotation.projectName || "Propuesta comercial";
  const reference = quotation.referenceName || project;
  const subject = `Cotización ${quotation.number} - ${project}`;
  const responseSubject = encodeURIComponent(
    `Respuesta a cotización ${quotation.number} - ${project}`,
  );

  const conditions = quotation.notes.trim()
    ? `
      <div style="margin-top:14px;border-left:3px solid #2f6fed;background:#f5f8fc;padding:11px 13px;">
        <div style="margin-bottom:4px;color:#245bd6;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Condiciones comerciales</div>
        <div style="color:#475569;font-size:11px;line-height:1.55;">${escapeEmailHtml(quotation.notes).replaceAll("\n", "<br />")}</div>
      </div>
    `
    : "";

  const flowPayment =
    quotation.paymentOption === "TRANSFER_FLOW" && quotation.flowPaymentUrl
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:14px;border-top:1px solid #e5eaf0;border-collapse:collapse;">
          <tr>
            <td class="quote-flow-copy" valign="middle" style="padding:13px 12px 0 0;color:#475569;font-size:11px;line-height:1.5;">
              <strong style="display:block;color:#172033;font-size:11px;">Pago online con Flow</strong>
              Total disponible: ${escapeEmailHtml(money(quotation.totalAmount))}
            </td>
            <td class="quote-flow-value" align="right" valign="middle" style="padding-top:13px;">
              <a href="${escapeEmailHtml(quotation.flowPaymentUrl)}" style="display:inline-block;border-radius:7px;background:#10213a;padding:10px 14px;color:#ffffff;font-size:11px;font-weight:750;line-height:1.2;text-decoration:none;white-space:nowrap;">Pagar con Flow</a>
            </td>
          </tr>
        </table>
      `
      : "";

  const content = `
    <p style="margin:0 0 5px;color:#172033;font-size:13px;font-weight:700;line-height:1.5;">
      Estimado(a) ${escapeEmailHtml(quotation.contactName || "cliente")}:
    </p>
    <p style="margin:0 0 15px;color:#475569;font-size:12.5px;line-height:1.6;">
      Te enviamos la propuesta preparada para <strong style="color:#172033;">${escapeEmailHtml(quotation.clientName)}</strong>. El documento formal está adjunto en PDF para su revisión.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 14px;border:1px solid #dfe6ee;border-radius:8px;border-collapse:separate;border-spacing:0;background:#f8fafc;">
      <tr>
        <td class="quote-meta-cell" width="48%" valign="top" style="width:48%;padding:11px 13px;">
          <div style="color:#64748b;font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Referencia</div>
          <div style="margin-top:4px;color:#172033;font-size:12px;font-weight:750;line-height:1.4;">${escapeEmailHtml(reference)}</div>
        </td>
        <td class="quote-meta-cell" width="26%" valign="top" style="width:26%;padding:11px 12px;border-left:1px solid #dfe6ee;">
          <div style="color:#64748b;font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Emisión</div>
          <div style="margin-top:4px;color:#172033;font-size:10px;font-weight:700;line-height:1.45;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td class="quote-meta-cell" width="26%" valign="top" style="width:26%;padding:11px 12px;border-left:1px solid #dfe6ee;">
          <div style="color:#64748b;font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:4px;color:#172033;font-size:10px;font-weight:700;line-height:1.45;">${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 7px;border-collapse:collapse;">
      <tr>
        <td style="color:#172033;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Detalle de servicios</td>
        <td align="right" style="color:#64748b;font-size:10px;">${quotation.items.length} ${quotation.items.length === 1 ? "ítem" : "ítems"}</td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #dfe6ee;border-radius:8px;border-collapse:separate;border-spacing:0;background:#ffffff;">
      ${serviceRows(quotation)}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:12px;border:1px solid #cfd9e6;border-radius:8px;border-collapse:separate;border-spacing:0;background:#f5f8fc;">
      <tr>
        <td class="quote-total-copy" valign="middle" style="padding:13px 15px;color:#64748b;font-size:10px;line-height:1.65;">
          Neto <strong style="color:#334155;">${escapeEmailHtml(money(quotation.netAmount))}</strong><br />
          IVA 19% <strong style="color:#334155;">${escapeEmailHtml(money(quotation.taxAmount))}</strong>
        </td>
        <td class="quote-total-value" align="right" valign="middle" width="230" style="width:230px;padding:13px 15px;color:#172033;font-size:22px;font-weight:800;letter-spacing:-.5px;white-space:nowrap;">
          ${escapeEmailHtml(money(quotation.totalAmount))}
          <span style="display:block;margin-top:2px;color:#245bd6;font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Total IVA incluido · CLP</span>
        </td>
      </tr>
    </table>

    ${conditions}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:15px;border-top:1px solid #e5eaf0;border-bottom:1px solid #e5eaf0;border-collapse:collapse;">
      <tr>
        <td class="quote-action-copy" valign="middle" style="padding:13px 14px 13px 0;color:#475569;font-size:11px;line-height:1.5;">
          <strong style="display:block;color:#172033;font-size:11px;">¿Aprobamos esta propuesta?</strong>
          Responde para confirmar, solicitar ajustes o resolver dudas.
        </td>
        <td class="quote-action-value" align="right" valign="middle" style="padding:13px 0;">
          <a class="quote-cta" href="mailto:${escapeEmailHtml(quotation.senderEmail)}?subject=${responseSubject}" style="display:inline-block;border-radius:7px;background:#2f6fed;padding:10px 14px;color:#ffffff;font-size:11px;font-weight:750;line-height:1.2;text-decoration:none;white-space:nowrap;">Responder cotización</a>
        </td>
      </tr>
    </table>

    ${flowPayment}

    <div style="margin-top:15px;">
      <div style="margin-bottom:5px;color:#172033;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Datos para transferencia</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td class="quote-payment-label" width="31%" style="width:31%;padding:5px 0;color:#64748b;font-size:10px;">Titular / RUT</td>
          <td class="quote-payment-value" align="right" style="padding:5px 0;color:#172033;font-size:10px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.holder)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.taxId)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:5px 0;border-top:1px solid #e5eaf0;color:#64748b;font-size:10px;">Banco / cuenta</td>
          <td class="quote-payment-value" align="right" style="padding:5px 0;border-top:1px solid #e5eaf0;color:#172033;font-size:10px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.institution)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountType)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountNumber)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:5px 0;border-top:1px solid #e5eaf0;color:#64748b;font-size:10px;">Comprobante</td>
          <td class="quote-payment-value" align="right" style="padding:5px 0;border-top:1px solid #e5eaf0;color:#172033;font-size:10px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.email)}</td>
        </tr>
      </table>
    </div>

    <p style="margin:16px 0 0;padding-top:13px;border-top:1px solid #e5eaf0;color:#475569;font-size:11px;line-height:1.55;">
      Saludos cordiales,<br />
      <strong style="color:#172033;font-size:12px;">${escapeEmailHtml(quotation.senderName)}</strong><br />
      ${escapeEmailHtml(quotation.senderRole)} ·
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#245bd6;text-decoration:none;">${escapeEmailHtml(quotation.senderEmail)}</a>
    </p>
  `;

  const text = [
    `Estimado(a) ${quotation.contactName || "cliente"}:`,
    "",
    `Adjuntamos la cotización ${quotation.number} preparada para ${quotation.clientName}.`,
    `Referencia: ${reference}`,
    `Proyecto: ${project}`,
    `Emisión: ${date(quotation.issuedAt)}`,
    `Vigencia: hasta el ${date(quotation.validUntil)}`,
    "",
    "SERVICIOS COTIZADOS",
    ...quotation.items.flatMap((item, index) => [
      `${index + 1}. ${item.description}`,
      item.detail ? `   ${item.detail}` : null,
      `   ${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`,
    ]),
    "",
    `Neto: ${money(quotation.netAmount)}`,
    `IVA 19%: ${money(quotation.taxAmount)}`,
    `TOTAL: ${money(quotation.totalAmount)}`,
    quotation.notes.trim() ? "" : null,
    quotation.notes.trim() ? "CONDICIONES COMERCIALES" : null,
    quotation.notes.trim() || null,
    "",
    "DATOS PARA TRANSFERENCIA",
    `${VIALOOP_PAYMENT_DETAILS.holder} · RUT ${VIALOOP_PAYMENT_DETAILS.taxId}`,
    `${VIALOOP_PAYMENT_DETAILS.institution} · ${VIALOOP_PAYMENT_DETAILS.accountType}`,
    `N.º de cuenta: ${VIALOOP_PAYMENT_DETAILS.accountNumber}`,
    `Comprobantes: ${VIALOOP_PAYMENT_DETAILS.email}`,
    quotation.paymentOption === "TRANSFER_FLOW" && quotation.flowPaymentUrl
      ? `Pago Flow: ${quotation.flowPaymentUrl}`
      : null,
    "",
    "Para aprobar o solicitar ajustes, responde directamente a este correo.",
    `El PDF formal de ${quotation.number} se encuentra adjunto.`,
    "",
    quotation.senderName,
    quotation.senderRole,
    quotation.senderEmail,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject,
    text,
    html: buildVialoopEmailLayout({
      eyebrow: "Cotizaciones Vialoop",
      title: `Cotización N.º ${quotation.number}`,
      reference: "PDF adjunto",
      preheader: `${quotation.number} · ${project} · ${money(quotation.totalAmount)}`,
      content,
      footer:
        "Vialoop Studio SpA · vialoop.cl<br />Cotización generada desde el Portal Vialoop.",
    }),
  };
}
