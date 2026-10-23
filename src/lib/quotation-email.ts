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
        ? `<div style="max-width:360px;margin-top:5px;color:#66666a;font-size:12px;line-height:1.58;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";

      return `
        <table class="quotation-item-row" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #d8d8d4;">
          <tr>
            <td class="quotation-item-number" valign="top" width="34" style="width:34px;padding:17px 8px 17px 0;color:#8a8a8d;font-size:9px;font-weight:800;letter-spacing:.06em;">
              ${String(index + 1).padStart(2, "0")}
            </td>
            <td class="quotation-item-service" valign="top" style="padding:15px 14px 16px 0;">
              <div style="color:#181819;font-size:13px;font-weight:780;line-height:1.4;">${escapeEmailHtml(item.description)}</div>
              ${detail}
            </td>
            <td class="quotation-item-metric" align="center" valign="top" width="58" style="width:58px;padding:16px 5px;color:#4b4b4e;font-size:11px;line-height:1.45;">
              <span style="display:block;margin-bottom:4px;color:#8a8a8d;font-size:7px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Cant.</span>
              ${item.quantity}
            </td>
            <td class="quotation-item-metric" align="right" valign="top" width="88" style="width:88px;padding:16px 6px;color:#4b4b4e;font-size:11px;line-height:1.45;white-space:nowrap;">
              <span style="display:block;margin-bottom:4px;color:#8a8a8d;font-size:7px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Unitario</span>
              ${escapeEmailHtml(money(item.unitPrice))}
            </td>
            <td class="quotation-item-metric" align="right" valign="top" width="102" style="width:102px;padding:16px 0 16px 6px;color:#181819;font-size:11px;font-weight:800;line-height:1.45;white-space:nowrap;">
              <span style="display:block;margin-bottom:4px;color:#8a8a8d;font-size:7px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Subtotal</span>
              ${escapeEmailHtml(money(item.quantity * item.unitPrice))}
            </td>
          </tr>
        </table>
      `;
    })
    .join("");
}

export function buildQuotationEmail(quotation: QuotationMetadata) {
  const project = quotation.projectName || "Propuesta comercial";
  const subject = `Cotización ${quotation.number} · ${project}`;
  const conditions = quotation.notes.trim()
    ? `
      <div style="margin-top:32px;padding-top:22px;border-top:1px solid #181819;">
        <div style="margin-bottom:10px;color:#77777a;font-size:8px;font-weight:800;letter-spacing:1.35px;text-transform:uppercase;">Condiciones comerciales</div>
        <div style="color:#555558;font-size:12px;line-height:1.68;">${escapeEmailHtml(quotation.notes).replaceAll("\n", "<br />")}</div>
      </div>
    `
    : "";

  const content = `
    <p style="margin:0 0 8px;color:#181819;font-size:15px;font-weight:760;line-height:1.55;">
      Estimado/a ${escapeEmailHtml(quotation.contactName || "cliente")}:
    </p>
    <p style="max-width:565px;margin:0 0 29px;color:#5f5f62;font-size:14px;line-height:1.75;">
      Presentamos nuestra propuesta para <strong style="color:#181819;">${escapeEmailHtml(quotation.clientName)}</strong>.
      A continuación encontrará el alcance económico resumido; la versión formal y completa se adjunta en PDF.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 31px;border-collapse:collapse;border-top:1px solid #181819;border-bottom:1px solid #181819;">
      <tr>
        <td class="quotation-meta-cell" width="50%" valign="top" style="width:50%;padding:15px 16px 17px 0;">
          <div style="color:#858588;font-size:7px;font-weight:800;letter-spacing:1.05px;text-transform:uppercase;">Cliente / proyecto</div>
          <div style="margin-top:6px;color:#181819;font-size:13px;font-weight:780;line-height:1.42;">${escapeEmailHtml(quotation.clientName)}</div>
          <div style="margin-top:3px;color:#66666a;font-size:11px;line-height:1.45;">${escapeEmailHtml(project)}</div>
        </td>
        <td class="quotation-meta-cell" width="25%" valign="top" style="width:25%;padding:15px 14px 17px;border-left:1px solid #d8d8d4;">
          <div style="color:#858588;font-size:7px;font-weight:800;letter-spacing:1.05px;text-transform:uppercase;">Emisión</div>
          <div style="margin-top:7px;color:#181819;font-size:11px;font-weight:750;line-height:1.45;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td class="quotation-meta-cell" width="25%" valign="top" style="width:25%;padding:15px 0 17px 14px;border-left:1px solid #d8d8d4;">
          <div style="color:#858588;font-size:7px;font-weight:800;letter-spacing:1.05px;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:7px;color:#181819;font-size:11px;font-weight:750;line-height:1.45;">Hasta ${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 11px;color:#77777a;font-size:8px;font-weight:800;letter-spacing:1.35px;text-transform:uppercase;">Servicios y alcance</td>
        <td align="right" style="padding:0 0 11px;color:#858588;font-size:9px;font-weight:700;">${quotation.items.length} ${quotation.items.length === 1 ? "ítem" : "ítems"}</td>
      </tr>
    </table>

    <div style="border-bottom:1px solid #181819;">
      ${serviceRows(quotation)}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:28px 0 0;border-collapse:collapse;border-top:2px solid #181819;border-bottom:1px solid #181819;">
      <tr>
        <td style="padding:14px 0 5px;color:#77777a;font-size:11px;">Neto</td>
        <td align="right" style="padding:14px 0 5px;color:#3d3d40;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.netAmount))}</td>
      </tr>
      <tr>
        <td style="padding:4px 0 13px;color:#77777a;font-size:11px;">IVA 19%</td>
        <td align="right" style="padding:4px 0 13px;color:#3d3d40;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.taxAmount))}</td>
      </tr>
      <tr>
        <td class="quotation-total-label" style="padding:15px 0 18px;border-top:1px solid #d8d8d4;color:#181819;font-size:12px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;">Inversión total</td>
        <td class="quotation-total-value" align="right" style="padding:10px 0 16px;border-top:1px solid #d8d8d4;color:#111113;font-size:27px;font-weight:820;letter-spacing:-.75px;">${escapeEmailHtml(money(quotation.totalAmount))}</td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:28px 0 0;border-collapse:collapse;">
      <tr>
        <td width="3" style="width:3px;background:#181819;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:1px 0 2px 17px;color:#5f5f62;font-size:12.5px;line-height:1.7;">
          <strong style="display:block;margin-bottom:3px;color:#181819;font-size:12px;">Siguiente paso</strong>
          Esta propuesta se mantiene vigente hasta el <strong style="color:#181819;">${escapeEmailHtml(date(quotation.validUntil))}</strong>.
          Para aprobarla, solicitar ajustes o resolver dudas, responda directamente a este correo.
        </td>
      </tr>
    </table>

    ${conditions}

    <div style="margin-top:32px;padding-top:22px;border-top:1px solid #181819;">
      <div style="margin-bottom:10px;color:#77777a;font-size:8px;font-weight:800;letter-spacing:1.35px;text-transform:uppercase;">Datos para pago</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #d8d8d4;border-bottom:1px solid #181819;">
        <tr>
          <td class="quotation-payment-label" style="padding:11px 0;color:#77777a;font-size:10.5px;">Titular</td>
          <td class="quotation-payment-value" align="right" style="padding:11px 0;color:#181819;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.holder)} · RUT ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.taxId)}</td>
        </tr>
        <tr>
          <td class="quotation-payment-label" style="padding:11px 0;border-top:1px solid #e7e7e3;color:#77777a;font-size:10.5px;">Institución / tipo</td>
          <td class="quotation-payment-value" align="right" style="padding:11px 0;border-top:1px solid #e7e7e3;color:#181819;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.institution)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountType)}</td>
        </tr>
        <tr>
          <td class="quotation-payment-label" style="padding:11px 0;border-top:1px solid #e7e7e3;color:#77777a;font-size:10.5px;">Cuenta / comprobante</td>
          <td class="quotation-payment-value" align="right" style="padding:11px 0;border-top:1px solid #e7e7e3;color:#181819;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountNumber)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.email)}</td>
        </tr>
      </table>
    </div>

    <div style="margin-top:32px;padding-top:22px;border-top:1px solid #d8d8d4;color:#303033;font-size:12.5px;line-height:1.68;">
      Atentamente,<br /><br />
      <strong style="color:#181819;font-size:14px;">${escapeEmailHtml(quotation.senderName)}</strong><br />
      <span style="color:#66666a;">${escapeEmailHtml(quotation.senderRole)}</span><br />
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#181819;text-decoration:underline;text-underline-offset:3px;">${escapeEmailHtml(quotation.senderEmail)}</a>
    </div>
  `;

  const text = [
    `Estimado/a ${quotation.contactName || "cliente"}:`,
    "",
    `Adjuntamos la cotización ${quotation.number} preparada para ${quotation.clientName}.`,
    `Proyecto: ${project}`,
    "",
    ...quotation.items.flatMap((item, index) => [
      `${index + 1}. ${item.description}`,
      item.detail ? `   ${item.detail}` : null,
      `   ${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`,
    ]),
    "",
    `Neto: ${money(quotation.netAmount)}`,
    `IVA 19%: ${money(quotation.taxAmount)}`,
    `Total: ${money(quotation.totalAmount)}`,
    `Vigencia: hasta el ${date(quotation.validUntil)}.`,
    quotation.notes.trim() ? "" : null,
    quotation.notes.trim() ? "Condiciones comerciales:" : null,
    quotation.notes.trim() || null,
    "",
    "Datos para pago:",
    `${VIALOOP_PAYMENT_DETAILS.holder} · RUT ${VIALOOP_PAYMENT_DETAILS.taxId}`,
    `${VIALOOP_PAYMENT_DETAILS.institution} · ${VIALOOP_PAYMENT_DETAILS.accountType}`,
    `N.º de cuenta: ${VIALOOP_PAYMENT_DETAILS.accountNumber}`,
    `Comprobantes: ${VIALOOP_PAYMENT_DETAILS.email}`,
    "",
    "El PDF formal se encuentra adjunto a este correo.",
    "",
    "Atentamente,",
    quotation.senderName,
    quotation.senderRole,
    "Vialoop Studio SpA",
    quotation.senderEmail,
    "vialoop.cl",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject,
    text,
    html: buildVialoopEmailLayout({
      eyebrow: "Propuesta comercial",
      title: project,
      reference: quotation.number,
      preheader: `${quotation.number} · ${quotation.clientName} · Total ${money(quotation.totalAmount)}`,
      content,
      footer:
        "Vialoop Studio SpA · Diseño web · Sistemas · Hosting<br />Documento comercial enviado desde el Portal Vialoop.",
    }),
  };
}
