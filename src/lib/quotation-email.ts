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
        ? `<div style="max-width:390px;margin-top:6px;color:#667085;font-size:12px;line-height:1.6;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";

      return `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;${index > 0 ? "border-top:1px solid #eaecf0;" : ""}">
          <tr>
            <td class="quote-item-copy" valign="top" style="padding:17px 16px 17px 17px;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                <tr>
                  <td valign="top" style="padding-right:12px;">
                    <span style="display:inline-block;min-width:25px;border-radius:999px;background:#eaf1ff;padding:5px 6px;color:#175cd3;font-size:9px;font-weight:800;line-height:1;text-align:center;">${String(index + 1).padStart(2, "0")}</span>
                  </td>
                  <td valign="top">
                    <div style="color:#101828;font-size:14px;font-weight:700;line-height:1.42;">${escapeEmailHtml(item.description)}</div>
                    ${detail}
                  </td>
                </tr>
              </table>
            </td>
            <td class="quote-item-value" align="right" valign="top" width="145" style="width:145px;padding:17px 17px 17px 10px;color:#101828;font-size:13px;font-weight:700;line-height:1.45;white-space:nowrap;">
              ${escapeEmailHtml(money(item.quantity * item.unitPrice))}
              <span style="display:block;margin-top:5px;color:#667085;font-size:10px;font-weight:400;white-space:normal;">${item.quantity} × ${escapeEmailHtml(money(item.unitPrice))}</span>
            </td>
          </tr>
        </table>
      `;
    })
    .join("");
}

export function buildQuotationEmail(quotation: QuotationMetadata) {
  const project = quotation.projectName || "Propuesta comercial";
  const subject = `Cotización ${quotation.number} - ${project}`;
  const responseSubject = encodeURIComponent(
    `Respuesta a cotización ${quotation.number} - ${project}`,
  );
  const conditions = quotation.notes.trim()
    ? `
      <div style="margin-top:25px;border:1px solid #d6e4ff;border-radius:10px;background:#f5f8ff;padding:16px 18px;">
        <div style="margin-bottom:7px;color:#175cd3;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Condiciones comerciales</div>
        <div style="color:#344054;font-size:12px;line-height:1.68;">${escapeEmailHtml(quotation.notes).replaceAll("\n", "<br />")}</div>
      </div>
    `
    : "";

  const content = `
    <p style="margin:0 0 17px;color:#101828;font-size:14px;line-height:1.65;">
      Estimado(a) <strong>${escapeEmailHtml(quotation.contactName || "cliente")}</strong>:
    </p>
    <p style="margin:0 0 23px;color:#475467;font-size:14px;line-height:1.7;">
      Adjuntamos la cotización preparada para <strong style="color:#101828;">${escapeEmailHtml(quotation.clientName)}</strong>.
      El PDF contiene el detalle completo del alcance, los valores y las condiciones de la propuesta.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 25px;overflow:hidden;border:1px solid #e4e7ec;border-radius:10px;border-collapse:separate;border-spacing:0;background:#f9fafb;">
      <tr>
        <td class="quote-meta-cell" width="50%" valign="top" style="width:50%;padding:16px 17px;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Proyecto</div>
          <div style="margin-top:6px;color:#101828;font-size:14px;font-weight:700;line-height:1.42;">${escapeEmailHtml(project)}</div>
          <div style="margin-top:4px;color:#667085;font-size:11px;line-height:1.45;">${escapeEmailHtml(quotation.clientName)}</div>
        </td>
        <td class="quote-meta-cell" width="25%" valign="top" style="width:25%;padding:16px 14px;border-left:1px solid #e4e7ec;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Emisión</div>
          <div style="margin-top:7px;color:#101828;font-size:11px;font-weight:700;line-height:1.5;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td class="quote-meta-cell" width="25%" valign="top" style="width:25%;padding:16px 14px;border-left:1px solid #e4e7ec;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:7px;color:#101828;font-size:11px;font-weight:700;line-height:1.5;">Hasta ${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 10px;border-collapse:collapse;">
      <tr>
        <td style="color:#344054;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Servicios cotizados</td>
        <td align="right" style="color:#667085;font-size:11px;">${quotation.items.length} ${quotation.items.length === 1 ? "ítem" : "ítems"}</td>
      </tr>
    </table>

    <div style="overflow:hidden;border:1px solid #e4e7ec;border-radius:10px;background:#ffffff;">
      ${serviceRows(quotation)}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:24px 0 0;overflow:hidden;border:1px solid #e4e7ec;border-radius:10px;border-collapse:separate;border-spacing:0;background:#f9fafb;">
      <tr>
        <td class="quote-total-copy" valign="middle" style="padding:18px 20px;color:#667085;font-size:11px;line-height:1.75;">
          Neto <strong style="color:#344054;">${escapeEmailHtml(money(quotation.netAmount))}</strong><br />
          IVA 19% <strong style="color:#344054;">${escapeEmailHtml(money(quotation.taxAmount))}</strong>
        </td>
        <td class="quote-total-value" align="right" valign="middle" width="245" style="width:245px;padding:18px 20px;color:#175cd3;font-size:26px;font-weight:800;letter-spacing:-.6px;white-space:nowrap;">
          ${escapeEmailHtml(money(quotation.totalAmount))}
          <span style="display:block;margin-top:3px;color:#667085;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;">Total IVA incluido · CLP</span>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 16px;color:#475467;font-size:12.5px;line-height:1.7;">
      La propuesta se mantiene vigente hasta el <strong style="color:#101828;">${escapeEmailHtml(date(quotation.validUntil))}</strong>.
      Para aprobarla, solicitar ajustes o resolver dudas, responda directamente a este correo.
    </p>
    <a class="quote-cta" href="mailto:${escapeEmailHtml(quotation.senderEmail)}?subject=${responseSubject}" style="display:inline-block;border-radius:9px;background:#175cd3;padding:13px 20px;color:#ffffff;font-size:13px;font-weight:700;line-height:1.2;text-decoration:none;">Responder sobre esta cotización</a>
    <div style="margin-top:10px;color:#667085;font-size:11px;line-height:1.55;">El documento formal ${escapeEmailHtml(quotation.number)} está adjunto en formato PDF.</div>

    ${conditions}

    <div style="margin-top:25px;padding-top:22px;border-top:1px solid #eaecf0;">
      <div style="margin-bottom:10px;color:#344054;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Datos para transferencia</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td class="quote-payment-label" width="35%" style="width:35%;padding:8px 0;color:#667085;font-size:11px;">Titular</td>
          <td class="quote-payment-value" align="right" style="padding:8px 0;color:#101828;font-size:11px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.holder)} · RUT ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.taxId)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:8px 0;border-top:1px solid #eaecf0;color:#667085;font-size:11px;">Banco / tipo</td>
          <td class="quote-payment-value" align="right" style="padding:8px 0;border-top:1px solid #eaecf0;color:#101828;font-size:11px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.institution)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountType)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:8px 0;border-top:1px solid #eaecf0;color:#667085;font-size:11px;">Cuenta / comprobante</td>
          <td class="quote-payment-value" align="right" style="padding:8px 0;border-top:1px solid #eaecf0;color:#101828;font-size:11px;font-weight:700;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountNumber)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.email)}</td>
        </tr>
      </table>
    </div>

    <p style="margin:25px 0 0;color:#475467;font-size:12.5px;line-height:1.65;">
      Saludos cordiales,<br /><br />
      <strong style="color:#101828;font-size:14px;">${escapeEmailHtml(quotation.senderName)}</strong><br />
      <span style="color:#667085;">${escapeEmailHtml(quotation.senderRole)}</span><br />
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#175cd3;text-decoration:none;">${escapeEmailHtml(quotation.senderEmail)}</a>
    </p>
  `;

  const text = [
    `Estimado(a) ${quotation.contactName || "cliente"}:`,
    "",
    `Adjuntamos la cotización ${quotation.number} preparada para ${quotation.clientName}.`,
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
    "",
    "Para aprobar o solicitar ajustes, responda directamente a este correo.",
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
