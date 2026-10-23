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
  const parsed = new Date(
    `${value}T12:00:00Z`,
  );

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(parsed);
}

function deadlineLabel(daysUntilExpiry: number) {
  if (daysUntilExpiry === 0) {
    return "vence hoy";
  }

  const overdueDays = Math.abs(
    daysUntilExpiry,
  );

  return overdueDays === 1
    ? "venció ayer"
    : `venció hace ${overdueDays} días`;
}

export function buildQuotationExpiryAlertEmail(
  quotation: QuotationMetadata,
  daysUntilExpiry: number,
  portalUrl: string,
  responsibleName: string,
) {
  const deadline = deadlineLabel(
    daysUntilExpiry,
  );
  const project =
    quotation.projectName ||
    "Propuesta general";
  const subject = `Seguimiento requerido · ${quotation.number} ${deadline}`;
  const clientSubject = `Seguimiento cotización ${quotation.number} · ${project}`;
  const clientGreeting =
    quotation.contactName.trim()
      ? `Hola ${quotation.contactName.trim()},`
      : "Hola,";
  const clientBody = [
    clientGreeting,
    "",
    `Quería saber si pudiste revisar la cotización ${quotation.number} que preparamos para ${project}.`,
    "",
    "Quedo disponible para resolver dudas, revisar comentarios o ajustar algún punto del alcance. Si la propuesta está conforme, podemos coordinar los próximos pasos para comenzar.",
    "",
    "Saludos cordiales,",
    quotation.senderName,
    "Vialoop Studio SpA",
  ].join("\n");
  const clientMailUrl = `mailto:${quotation.recipientEmail}?subject=${encodeURIComponent(clientSubject)}&body=${encodeURIComponent(clientBody)}`;
  const services = quotation.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eaecf0;color:#344054;font-size:12px;line-height:1.5;">
            ${escapeEmailHtml(item.description)}${item.quantity > 1 ? ` <span style="color:#667085;">× ${item.quantity}</span>` : ""}
          </td>
          <td align="right" style="padding:10px 0 10px 14px;border-bottom:1px solid #eaecf0;color:#101828;font-size:12px;font-weight:700;white-space:nowrap;">
            ${escapeEmailHtml(money(item.quantity * item.unitPrice))}
          </td>
        </tr>
      `,
    )
    .join("");
  const content = `
    <p style="margin:0 0 18px;color:#101828;font-size:14px;line-height:1.65;">
      Hola <strong>${escapeEmailHtml(responsibleName || "equipo")}</strong>:
    </p>
    <p style="margin:0 0 22px;color:#475467;font-size:14px;line-height:1.7;">
      La cotización <strong style="color:#101828;">${escapeEmailHtml(quotation.number)}</strong> de
      <strong style="color:#101828;">${escapeEmailHtml(quotation.clientName)}</strong> ${escapeEmailHtml(deadline)}.
      Corresponde contactar al cliente y registrar el resultado en Seguimiento.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 22px;border:1px solid #e4e7ec;border-radius:10px;border-collapse:separate;border-spacing:0;background:#f9fafb;">
      <tr>
        <td width="50%" valign="top" style="width:50%;padding:15px 17px;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;">Cliente / contacto</div>
          <div style="margin-top:6px;color:#101828;font-size:13px;font-weight:700;">${escapeEmailHtml(quotation.clientName)}</div>
          <div style="margin-top:4px;color:#667085;font-size:11px;">${escapeEmailHtml(quotation.contactName || "Contacto por definir")} · ${escapeEmailHtml(quotation.recipientEmail)}</div>
        </td>
        <td width="25%" valign="top" style="width:25%;padding:15px 14px;border-left:1px solid #e4e7ec;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;">Vigencia</div>
          <div style="margin-top:7px;color:#101828;font-size:11px;font-weight:700;">${escapeEmailHtml(date(quotation.validUntil))}</div>
        </td>
        <td width="25%" valign="top" style="width:25%;padding:15px 14px;border-left:1px solid #e4e7ec;">
          <div style="color:#667085;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;">Total</div>
          <div style="margin-top:7px;color:#175cd3;font-size:13px;font-weight:800;">${escapeEmailHtml(money(quotation.totalAmount))}</div>
        </td>
      </tr>
    </table>

    <div style="margin-bottom:8px;color:#344054;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;">Lo cotizado · ${escapeEmailHtml(project)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 23px;border-collapse:collapse;">
      ${services}
    </table>

    <a href="${escapeEmailHtml(clientMailUrl)}" style="display:inline-block;margin:0 8px 8px 0;border-radius:8px;background:#175cd3;padding:12px 17px;color:#ffffff;font-size:12px;font-weight:700;text-decoration:none;">Preparar correo al cliente</a>
    <a href="${escapeEmailHtml(portalUrl)}" style="display:inline-block;margin:0 0 8px;border:1px solid #d0d5dd;border-radius:8px;background:#ffffff;padding:11px 17px;color:#344054;font-size:12px;font-weight:700;text-decoration:none;">Abrir Seguimiento</a>

    <p style="margin:15px 0 0;color:#667085;font-size:11px;line-height:1.6;">
      El portal no contactó al cliente automáticamente. El mensaje queda a revisión del responsable antes de enviarlo.
    </p>
  `;
  const text = [
    `Seguimiento requerido: ${quotation.number} ${deadline}.`,
    "",
    `Cliente: ${quotation.clientName}`,
    `Contacto: ${quotation.contactName || "Por definir"}`,
    `Correo: ${quotation.recipientEmail}`,
    `Proyecto: ${project}`,
    `Vigencia: ${date(quotation.validUntil)}`,
    `Total: ${money(quotation.totalAmount)}`,
    "",
    "Servicios cotizados:",
    ...quotation.items.map(
      (item) =>
        `- ${item.description}${item.quantity > 1 ? ` x ${item.quantity}` : ""}`,
    ),
    "",
    "Contacta al cliente y registra el resultado en Seguimiento.",
    `Portal: ${portalUrl}`,
    "",
    "El portal no envió un mensaje automático al cliente.",
  ].join("\n");

  return {
    subject,
    text,
    html: buildVialoopEmailLayout({
      eyebrow: "Alerta comercial Vialoop",
      title: `Cotización ${deadline}`,
      reference: quotation.number,
      preheader: `${quotation.clientName} · ${project} · ${money(quotation.totalAmount)}`,
      content,
      footer:
        "Vialoop Studio SpA · Portal comercial<br />Alerta interna; no enviada al cliente.",
    }),
  };
}
