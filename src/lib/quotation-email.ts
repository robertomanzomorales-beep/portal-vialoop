import type { QuotationMetadata } from "@/lib/quotation";
import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
} from "@/lib/vialoop-email";

function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string) {
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

function itemRows(quotation: QuotationMetadata) {
  return quotation.items
    .map((item, index) => {
      const detail = item.detail
        ? `<div style="margin-top:5px;color:#636366;font-size:12px;line-height:1.55;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";

      return `
        <tr>
          <td valign="top" style="padding:15px 10px 15px 0;border-bottom:1px solid #ececf0;color:#8e8e93;font-size:11px;font-weight:700;">${String(index + 1).padStart(2, "0")}</td>
          <td valign="top" style="padding:15px 14px 15px 0;border-bottom:1px solid #ececf0;">
            <div style="color:#1d1d1f;font-size:13px;font-weight:750;line-height:1.4;">${escapeEmailHtml(item.description)}</div>
            ${detail}
          </td>
          <td align="center" valign="top" style="padding:15px 10px;border-bottom:1px solid #ececf0;color:#636366;font-size:12px;">${item.quantity}</td>
          <td align="right" valign="top" style="padding:15px 8px;border-bottom:1px solid #ececf0;color:#636366;font-size:11px;white-space:nowrap;">${escapeEmailHtml(money(item.unitPrice))}</td>
          <td align="right" valign="top" style="padding:15px 0 15px 10px;border-bottom:1px solid #ececf0;color:#1d1d1f;font-size:12px;font-weight:700;white-space:nowrap;">${escapeEmailHtml(money(item.quantity * item.unitPrice))}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildQuotationEmail(quotation: QuotationMetadata) {
  const project = quotation.projectName || "Propuesta comercial";
  const subject = `Cotización ${quotation.number} · ${project}`;

  const content = `
    <p style="margin:0 0 16px;color:#2c2c2e;font-size:14px;line-height:1.7;">
      Estimado/a <strong>${escapeEmailHtml(quotation.contactName || "cliente")}</strong>:
    </p>
    <p style="margin:0 0 24px;color:#636366;font-size:14px;line-height:1.7;">
      Junto con saludar, enviamos la propuesta preparada para
      <strong style="color:#1d1d1f;">${escapeEmailHtml(quotation.clientName)}</strong>.
      El documento formal se encuentra adjunto en formato PDF.
    </p>

    <div style="margin:0 0 24px;padding:17px 18px;border:1px solid #dedee3;border-radius:12px;background:#fafafa;">
      <div style="color:#8e8e93;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">Proyecto o propuesta</div>
      <div style="margin-top:6px;color:#1d1d1f;font-size:17px;font-weight:750;line-height:1.35;">${escapeEmailHtml(project)}</div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 20px;border-collapse:collapse;">
      <tr>
        <td width="50%" style="padding:0 12px 0 0;">
          <div style="color:#8e8e93;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Fecha de emisión</div>
          <div style="margin-top:5px;color:#1d1d1f;font-size:12px;font-weight:700;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td width="50%" style="padding:0 0 0 12px;border-left:1px solid #ececf0;">
          <div style="color:#8e8e93;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:5px;color:#1d1d1f;font-size:12px;font-weight:700;">Hasta ${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <th align="left" style="padding:9px 10px 9px 0;border-bottom:1px solid #1d1d1f;color:#8e8e93;font-size:9px;letter-spacing:1px;text-transform:uppercase;">Ítem</th>
        <th align="left" style="padding:9px 14px 9px 0;border-bottom:1px solid #1d1d1f;color:#8e8e93;font-size:9px;letter-spacing:1px;text-transform:uppercase;">Servicio y detalle</th>
        <th align="center" style="padding:9px 10px;border-bottom:1px solid #1d1d1f;color:#8e8e93;font-size:9px;letter-spacing:1px;text-transform:uppercase;">Cant.</th>
        <th align="right" style="padding:9px 8px;border-bottom:1px solid #1d1d1f;color:#8e8e93;font-size:9px;letter-spacing:1px;text-transform:uppercase;">Unitario</th>
        <th align="right" style="padding:9px 0 9px 10px;border-bottom:1px solid #1d1d1f;color:#8e8e93;font-size:9px;letter-spacing:1px;text-transform:uppercase;">Subtotal</th>
      </tr>
      ${itemRows(quotation)}
    </table>

    <table align="right" width="285" cellpadding="0" cellspacing="0" role="presentation" style="width:285px;max-width:100%;margin-top:22px;border-collapse:collapse;">
      <tr>
        <td style="padding:7px 0;color:#8e8e93;font-size:12px;">Neto</td>
        <td align="right" style="padding:7px 0;color:#1d1d1f;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.netAmount))}</td>
      </tr>
      <tr>
        <td style="padding:7px 0;color:#8e8e93;font-size:12px;">IVA 19%</td>
        <td align="right" style="padding:7px 0;color:#1d1d1f;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.taxAmount))}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 0;border-top:1px solid #1d1d1f;color:#1d1d1f;font-size:14px;font-weight:800;">Total</td>
        <td align="right" style="padding:12px 0 0;border-top:1px solid #1d1d1f;color:#1d1d1f;font-size:18px;font-weight:800;">${escapeEmailHtml(money(quotation.totalAmount))}</td>
      </tr>
    </table>

    <div style="clear:both;height:26px;line-height:26px;">&nbsp;</div>

    <div style="padding:15px 17px;border-left:3px solid #1d1d1f;background:#fafafa;color:#636366;font-size:12px;line-height:1.65;">
      Propuesta vigente hasta el <strong style="color:#1d1d1f;">${escapeEmailHtml(date(quotation.validUntil))}</strong>.
      Para aceptar, solicitar ajustes o resolver dudas, responde directamente a este correo.
    </div>

    <p style="margin:25px 0 0;color:#2c2c2e;font-size:13px;line-height:1.7;">
      Saludos cordiales,<br /><br />
      <strong>${escapeEmailHtml(quotation.senderName)}</strong><br />
      <span style="color:#636366;">${escapeEmailHtml(quotation.senderRole)}</span><br />
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#1d1d1f;text-decoration:underline;">${escapeEmailHtml(quotation.senderEmail)}</a>
    </p>
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
    "",
    "El PDF formal se encuentra adjunto a este correo.",
    "",
    "Saludos cordiales,",
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
