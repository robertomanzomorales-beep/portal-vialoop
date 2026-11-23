import "server-only";

import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
} from "@/lib/vialoop-email";

type RenewalConfirmationEmailInput = {
  subject: string;
  contactName: string;
  clientName: string;
  serviceName: string;
  domain: string;
  amount: string;
  paidAt: Date;
  nextDueDate: Date | null;
  message: string;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

function paragraph(value: string) {
  return escapeEmailHtml(value).replaceAll("\n", "<br />");
}

export function buildRenewalConfirmationEmail(
  input: RenewalConfirmationEmailInput,
) {
  const greeting = input.contactName.trim()
    ? `Hola ${input.contactName.trim()},`
    : "Hola,";
  const nextDate = input.nextDueDate
    ? formatDate(input.nextDueDate)
    : "Ciclo finalizado sin próximo vencimiento";
  const continuityMessage = input.nextDueDate
    ? "El servicio queda activo y el próximo vencimiento ya fue incorporado al control de Vialoop."
    : "El pago quedó confirmado y este ciclo fue cerrado sin programar un nuevo vencimiento.";

  const content = `
    <p style="margin:0 0 9px;color:#172033;font-size:14px;font-weight:700;line-height:1.55;">${escapeEmailHtml(greeting)}</p>
    <p style="margin:0 0 17px;color:#475569;font-size:13px;line-height:1.65;">${paragraph(input.message)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #dfe6ee;border-collapse:collapse;background:#ffffff;">
      <tr>
        <td colspan="2" style="padding:11px 14px;border-bottom:1px solid #dfe6ee;background:#f8fafc;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Resumen de renovación</td>
      </tr>
      <tr>
        <td style="width:38%;padding:10px 14px;border-bottom:1px solid #edf1f5;color:#667085;font-size:11px;">Servicio</td>
        <td style="padding:10px 14px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(input.serviceName)}</td>
      </tr>
      <tr>
        <td style="width:38%;padding:10px 14px;border-bottom:1px solid #edf1f5;color:#667085;font-size:11px;">Dominio o referencia</td>
        <td style="padding:10px 14px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(input.domain)}</td>
      </tr>
      <tr>
        <td style="width:38%;padding:10px 14px;border-bottom:1px solid #edf1f5;color:#667085;font-size:11px;">Pago confirmado</td>
        <td style="padding:10px 14px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(formatDate(input.paidAt))}</td>
      </tr>
      <tr>
        <td style="width:38%;padding:10px 14px;border-bottom:1px solid #edf1f5;color:#667085;font-size:11px;">Monto total</td>
        <td style="padding:10px 14px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(input.amount)}</td>
      </tr>
      <tr>
        <td style="width:38%;padding:10px 14px;color:#667085;font-size:11px;">Próximo vencimiento</td>
        <td style="padding:10px 14px;color:#175cd3;font-size:12px;font-weight:800;">${escapeEmailHtml(nextDate)}</td>
      </tr>
    </table>

    <p style="margin:17px 0 0;color:#475569;font-size:12.5px;line-height:1.65;">
      ${escapeEmailHtml(continuityMessage)} Si necesitas actualizar datos de facturación o contacto, responde este mismo correo.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:18px;border-top:1px solid #e5eaf0;border-collapse:collapse;">
      <tr>
        <td style="padding-top:14px;color:#475569;font-size:12px;line-height:1.55;">
          Saludos cordiales,<br />
          <strong style="color:#172033;font-size:13px;">Equipo Vialoop</strong><br />
          <a href="mailto:hosting@vialoop.cl" style="color:#175cd3;text-decoration:none;">hosting@vialoop.cl</a>
        </td>
      </tr>
    </table>
  `;

  const text = [
    greeting,
    "",
    input.message,
    "",
    "RESUMEN DE RENOVACIÓN",
    `Cliente: ${input.clientName}`,
    `Servicio: ${input.serviceName}`,
    `Dominio o referencia: ${input.domain}`,
    `Pago confirmado: ${formatDate(input.paidAt)}`,
    `Monto total: ${input.amount}`,
    `Próximo vencimiento: ${nextDate}`,
    "",
    continuityMessage,
    "",
    "Saludos cordiales,",
    "Equipo Vialoop",
    "hosting@vialoop.cl",
  ].join("\n");

  return {
    subject: input.subject,
    text,
    html: buildVialoopEmailLayout({
      eyebrow: "Servicio renovado",
      title: "Confirmación de renovación",
      reference: "Estado confirmado",
      preheader: `${input.clientName} · ${input.serviceName} renovado`,
      content,
      footer:
        "Vialoop Studio SpA · vialoop.cl<br />Confirmación de continuidad de servicio.",
    }),
  };
}
