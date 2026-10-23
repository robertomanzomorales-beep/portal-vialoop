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

function itemCards(quotation: QuotationMetadata) {
  return quotation.items
    .map((item, index) => {
      const detail = item.detail
        ? `<div style="margin-top:7px;color:#6e6e73;font-size:12px;line-height:1.6;">${escapeEmailHtml(item.detail).replaceAll("\n", "<br />")}</div>`
        : "";
      const background = index % 2 === 0 ? "#ffffff" : "#fafafa";

      return `
        <table class="quotation-item-card" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 10px;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #e1e1e6;border-radius:15px;background:${background};">
          <tr>
            <td class="quotation-item-number" align="center" valign="top" width="45" style="width:45px;padding:17px 8px;">
              <span style="display:inline-block;min-width:24px;padding:6px 4px;border-radius:999px;background:#eeeef1;color:#636366;font-size:10px;font-weight:800;line-height:1;">${String(index + 1).padStart(2, "0")}</span>
            </td>
            <td class="quotation-item-service" valign="top" style="padding:17px 12px 17px 0;">
              <div style="color:#1d1d1f;font-size:13px;font-weight:800;line-height:1.4;">${escapeEmailHtml(item.description)}</div>
              ${detail}
            </td>
            <td class="quotation-item-metric" align="center" valign="top" width="62" style="width:62px;padding:17px 7px;">
              <div style="color:#8e8e93;font-size:8px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">Cant.</div>
              <div style="margin-top:7px;color:#1d1d1f;font-size:12px;font-weight:700;">${item.quantity}</div>
            </td>
            <td class="quotation-item-metric" align="right" valign="top" width="90" style="width:90px;padding:17px 7px;">
              <div style="color:#8e8e93;font-size:8px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">Unitario</div>
              <div style="margin-top:7px;color:#636366;font-size:11px;font-weight:700;white-space:nowrap;">${escapeEmailHtml(money(item.unitPrice))}</div>
            </td>
            <td class="quotation-item-metric" align="right" valign="top" width="105" style="width:105px;padding:17px 15px 17px 7px;">
              <div style="color:#8e8e93;font-size:8px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;">Subtotal</div>
              <div style="margin-top:7px;color:#1d1d1f;font-size:12px;font-weight:800;white-space:nowrap;">${escapeEmailHtml(money(item.quantity * item.unitPrice))}</div>
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

  const content = `
    <p style="margin:0 0 8px;color:#1d1d1f;font-size:15px;font-weight:700;line-height:1.55;">
      Estimado/a ${escapeEmailHtml(quotation.contactName || "cliente")}:
    </p>
    <p style="margin:0 0 25px;color:#636366;font-size:14px;line-height:1.75;">
      Hemos preparado la siguiente propuesta para
      <strong style="color:#1d1d1f;">${escapeEmailHtml(quotation.clientName)}</strong>.
      El documento formal también se encuentra adjunto en PDF.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 13px;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #dedee3;border-radius:16px;background:#f7f7f8;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="color:#8e8e93;font-size:9px;font-weight:800;letter-spacing:1.25px;text-transform:uppercase;">Proyecto / propuesta</div>
          <div style="margin-top:7px;color:#1d1d1f;font-size:18px;font-weight:800;letter-spacing:-.35px;line-height:1.35;">${escapeEmailHtml(project)}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 28px;border-collapse:separate;border-spacing:8px 0;">
      <tr>
        <td width="50%" style="padding:14px 16px;border:1px solid #e5e5e9;border-radius:14px;background:#ffffff;">
          <div style="color:#8e8e93;font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Fecha de emisión</div>
          <div style="margin-top:6px;color:#1d1d1f;font-size:12px;font-weight:800;">${escapeEmailHtml(date(quotation.issuedAt))}</div>
        </td>
        <td width="50%" style="padding:14px 16px;border:1px solid #e5e5e9;border-radius:14px;background:#ffffff;">
          <div style="color:#8e8e93;font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:6px;color:#1d1d1f;font-size:12px;font-weight:800;">Hasta ${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 11px;border-collapse:collapse;">
      <tr>
        <td style="color:#8e8e93;font-size:9px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;">Servicios y valores</td>
        <td align="right" style="color:#8e8e93;font-size:9px;font-weight:700;">${quotation.items.length} ${quotation.items.length === 1 ? "ítem" : "ítems"}</td>
      </tr>
    </table>

    ${itemCards(quotation)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:22px 0 0;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:18px;background:#0b0b0d;">
      <tr>
        <td style="padding:20px 22px 8px;color:#a1a1a6;font-size:11px;">Neto</td>
        <td align="right" style="padding:20px 22px 8px;color:#f5f5f7;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.netAmount))}</td>
      </tr>
      <tr>
        <td style="padding:5px 22px 17px;color:#a1a1a6;font-size:11px;">IVA 19%</td>
        <td align="right" style="padding:5px 22px 17px;color:#f5f5f7;font-size:12px;font-weight:700;">${escapeEmailHtml(money(quotation.taxAmount))}</td>
      </tr>
      <tr>
        <td style="padding:18px 22px 21px;border-top:1px solid #343436;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;">Total</td>
        <td align="right" style="padding:15px 22px 21px;border-top:1px solid #343436;color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-.55px;">${escapeEmailHtml(money(quotation.totalAmount))}</td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:14px 0 0;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #e1e1e6;border-radius:15px;background:#f7f7f8;">
      <tr>
        <td style="padding:17px 19px;color:#636366;font-size:12px;line-height:1.65;">
          <strong style="display:block;margin-bottom:4px;color:#1d1d1f;font-size:12px;">Próximo paso</strong>
          Esta propuesta se mantiene vigente hasta el
          <strong style="color:#1d1d1f;">${escapeEmailHtml(date(quotation.validUntil))}</strong>.
          Para aprobarla, solicitar ajustes o resolver dudas, puede responder directamente a este correo.
        </td>
      </tr>
    </table>

    <div style="margin-top:29px;padding-top:23px;border-top:1px solid #e5e5e9;color:#2c2c2e;font-size:13px;line-height:1.7;">
      Saludos cordiales,<br /><br />
      <strong style="font-size:14px;">${escapeEmailHtml(quotation.senderName)}</strong><br />
      <span style="color:#636366;">${escapeEmailHtml(quotation.senderRole)}</span><br />
      <a href="mailto:${escapeEmailHtml(quotation.senderEmail)}" style="color:#1d1d1f;text-decoration:underline;text-underline-offset:3px;">${escapeEmailHtml(quotation.senderEmail)}</a>
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
