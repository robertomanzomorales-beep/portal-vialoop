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
    return "—";
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
        ? `<div style="max-width:390px;margin-top:6px;color:#5f5a51;font-size:12px;line-height:1.62;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";

      return `
        <table class="quote-item-row" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #c8c1b5;">
          <tr>
            <td class="quote-item-index" valign="top" width="38" style="width:38px;padding:19px 10px 20px 0;color:#df4825;font-size:9px;font-weight:800;letter-spacing:.08em;">
              ${String(index + 1).padStart(2, "0")}
            </td>
            <td class="quote-item-service" valign="top" style="padding:17px 18px 19px 0;">
              <div style="color:#151411;font-size:14px;font-weight:760;line-height:1.38;">${escapeEmailHtml(item.description)}</div>
              ${detail}
            </td>
            <td class="quote-item-value" align="right" valign="top" width="132" style="width:132px;padding:17px 0 19px;color:#151411;font-size:13px;font-weight:780;line-height:1.4;white-space:nowrap;">
              ${escapeEmailHtml(money(item.quantity * item.unitPrice))}
              <span style="display:block;margin-top:6px;color:#736e65;font-size:9px;font-weight:600;line-height:1.4;white-space:normal;">${item.quantity} × ${escapeEmailHtml(money(item.unitPrice))}</span>
            </td>
          </tr>
        </table>
      `;
    })
    .join("");
}

export function buildQuotationEmail(quotation: QuotationMetadata) {
  const project = quotation.projectName || "Propuesta comercial";
  const subject = `Cotización ${quotation.number} | ${project}`;
  const responseSubject = encodeURIComponent(
    `Respuesta a ${quotation.number} — ${project}`,
  );
  const conditions = quotation.notes.trim()
    ? `
      <div style="margin-top:34px;padding-top:25px;border-top:1px solid #151411;">
        <div style="margin-bottom:12px;color:#df4825;font-size:8px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">03 / Condiciones comerciales</div>
        <div style="padding-left:16px;border-left:3px solid #df4825;color:#4f4b44;font-size:12px;line-height:1.72;">${escapeEmailHtml(quotation.notes).replaceAll("\n", "<br />")}</div>
      </div>
    `
    : "";

  const content = `
    <p style="margin:0 0 8px;color:#151411;font-size:15px;font-weight:760;line-height:1.55;">
      Estimado/a ${escapeEmailHtml(quotation.contactName || "cliente")}:
    </p>
    <p style="max-width:570px;margin:0 0 30px;color:#4f4b44;font-size:14px;line-height:1.75;">
      Preparamos esta propuesta para <strong style="color:#151411;">${escapeEmailHtml(quotation.clientName)}</strong>.
      Aquí encontrará una lectura rápida de la inversión; el documento formal con el alcance y las condiciones completas va adjunto en PDF.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 34px;border-collapse:collapse;border-top:1px solid #151411;border-bottom:1px solid #151411;">
      <tr>
        <td class="quote-meta-cell" width="50%" valign="top" style="width:50%;padding:16px 18px 18px 0;">
          <div style="color:#736e65;font-size:7px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">Cliente / proyecto</div>
          <div style="margin-top:7px;color:#151411;font-size:13px;font-weight:780;line-height:1.4;">${escapeEmailHtml(quotation.clientName)}</div>
          <div style="margin-top:4px;color:#5f5a51;font-size:11px;line-height:1.5;">${escapeEmailHtml(project)}</div>
        </td>
        <td class="quote-meta-cell" width="25%" valign="top" style="width:25%;padding:16px 15px 18px;border-left:1px solid #c8c1b5;">
          <div style="color:#736e65;font-size:7px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">Emisión</div>
          <div style="margin-top:8px;color:#151411;font-size:11px;font-weight:720;line-height:1.5;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td class="quote-meta-cell" width="25%" valign="top" style="width:25%;padding:16px 0 18px 15px;border-left:1px solid #c8c1b5;">
          <div style="color:#736e65;font-size:7px;font-weight:800;letter-spacing:1.15px;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:8px;color:#151411;font-size:11px;font-weight:720;line-height:1.5;">Hasta ${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 11px;color:#df4825;font-size:8px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">01 / Alcance propuesto</td>
        <td align="right" style="padding:0 0 11px;color:#736e65;font-size:9px;font-weight:700;">${quotation.items.length} ${quotation.items.length === 1 ? "ítem" : "ítems"}</td>
      </tr>
    </table>

    <div style="border-bottom:1px solid #151411;">
      ${serviceRows(quotation)}
    </div>

    <div style="margin-top:34px;margin-bottom:12px;color:#df4825;font-size:8px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">02 / Inversión</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#151411;">
      <tr>
        <td class="quote-total-copy" width="48%" valign="middle" style="width:48%;padding:23px 24px;color:#aaa397;font-size:10.5px;line-height:1.7;">
          Neto&nbsp;&nbsp;<strong style="color:#f7f3e9;">${escapeEmailHtml(money(quotation.netAmount))}</strong><br />
          IVA 19%&nbsp;&nbsp;<strong style="color:#f7f3e9;">${escapeEmailHtml(money(quotation.taxAmount))}</strong>
        </td>
        <td class="quote-total-amount" align="right" valign="middle" style="padding:21px 24px;color:#f7f3e9;font-size:29px;font-weight:820;letter-spacing:-1px;white-space:nowrap;">
          ${escapeEmailHtml(money(quotation.totalAmount))}
          <span style="display:block;margin-top:4px;color:#df5a38;font-size:8px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">Total con IVA · CLP</span>
        </td>
      </tr>
    </table>

    <p style="margin:25px 0 18px;color:#4f4b44;font-size:12.5px;line-height:1.72;">
      La propuesta se mantiene vigente hasta el <strong style="color:#151411;">${escapeEmailHtml(date(quotation.validUntil))}</strong>.
      Puede aprobarla o solicitar ajustes respondiendo directamente a este mensaje.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <td>
          <a class="quote-cta" href="mailto:${escapeEmailHtml(quotation.senderEmail)}?subject=${responseSubject}" style="display:inline-block;background:#df4825;padding:14px 20px;color:#151411;font-size:12px;font-weight:820;line-height:1;text-decoration:none;">Responder sobre esta propuesta →</a>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;color:#736e65;font-size:10.5px;line-height:1.55;">El PDF formal de ${escapeEmailHtml(quotation.number)} está adjunto a este correo.</div>

    ${conditions}

    <div style="margin-top:34px;padding-top:25px;border-top:1px solid #151411;">
      <div style="margin-bottom:11px;color:#df4825;font-size:8px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">04 / Datos para pago</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #c8c1b5;border-bottom:1px solid #151411;">
        <tr>
          <td class="quote-payment-label" width="34%" style="width:34%;padding:11px 0;color:#736e65;font-size:10.5px;">Titular</td>
          <td class="quote-payment-value" align="right" style="padding:11px 0;color:#151411;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.holder)} · RUT ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.taxId)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:11px 0;border-top:1px solid #d8d1c5;color:#736e65;font-size:10.5px;">Institución / tipo</td>
          <td class="quote-payment-value" align="right" style="padding:11px 0;border-top:1px solid #d8d1c5;color:#151411;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.institution)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountType)}</td>
        </tr>
        <tr>
          <td class="quote-payment-label" style="padding:11px 0;border-top:1px solid #d8d1c5;color:#736e65;font-size:10.5px;">Cuenta / comprobante</td>
          <td class="quote-payment-value" align="right" style="padding:11px 0;border-top:1px solid #d8d1c5;color:#151411;font-size:11px;font-weight:760;">${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.accountNumber)} · ${escapeEmailHtml(VIALOOP_PAYMENT_DETAILS.email)}</td>
        </tr>
      </table>
    </div>

    <div style="margin-top:31px;padding-top:23px;border-top:1px solid #c8c1b5;color:#312f2a;font-size:12.5px;line-height:1.68;">
      <strong style="color:#151411;font-size:14px;">${escapeEmailHtml(quotation.senderName)}</strong><br />
      <span style="color:#5f5a51;">${escapeEmailHtml(quotation.senderRole)}</span><br />
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#151411;text-decoration:underline;text-underline-offset:3px;">${escapeEmailHtml(quotation.senderEmail)}</a>
    </div>
  `;

  const text = [
    `Estimado/a ${quotation.contactName || "cliente"}:`,
    "",
    `Adjuntamos la cotización ${quotation.number} preparada para ${quotation.clientName}.`,
    `Proyecto: ${project}`,
    `Emisión: ${date(quotation.issuedAt)}`,
    `Vigencia: hasta el ${date(quotation.validUntil)}`,
    "",
    "ALCANCE PROPUESTO",
    ...quotation.items.flatMap((item, index) => [
      `${index + 1}. ${item.description}`,
      item.detail ? `   ${item.detail}` : null,
      `   ${item.quantity} × ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`,
    ]),
    "",
    `Neto: ${money(quotation.netAmount)}`,
    `IVA 19%: ${money(quotation.taxAmount)}`,
    `TOTAL: ${money(quotation.totalAmount)}`,
    quotation.notes.trim() ? "" : null,
    quotation.notes.trim() ? "CONDICIONES COMERCIALES" : null,
    quotation.notes.trim() || null,
    "",
    "DATOS PARA PAGO",
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
    "Vialoop Studio SpA · vialoop.cl",
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
