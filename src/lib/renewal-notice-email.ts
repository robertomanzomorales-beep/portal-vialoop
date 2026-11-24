import "server-only";

import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
} from "@/lib/vialoop-email";

type RenewalNoticeEmailInput = {
  subject: string;
  body: string;
  clientName: string;
  serviceName: string;
  domain: string;
  dueDate: Date;
  amount: number | null;
  reminderLabel: string;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Por confirmar";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function editableMessage(value: string) {
  return value
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => {
      const content = escapeEmailHtml(paragraph).replaceAll("\n", "<br />");

      return `<p style="margin:0 0 13px;color:#475569;font-size:13px;line-height:1.62;">${content}</p>`;
    })
    .join("");
}

export function buildRenewalNoticeEmail(input: RenewalNoticeEmailInput) {
  const dueDate = formatDate(input.dueDate);
  const amount = formatCurrency(input.amount);
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 18px;border:1px solid #dfe6ee;border-collapse:collapse;background:#f8fafc;">
      <tr>
        <td style="width:34%;padding:9px 12px;border-bottom:1px solid #e7edf3;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;">Servicio</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e7edf3;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(input.serviceName)}</td>
      </tr>
      <tr>
        <td style="width:34%;padding:9px 12px;border-bottom:1px solid #e7edf3;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;">Referencia</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e7edf3;color:#172033;font-size:12px;font-weight:750;">${escapeEmailHtml(input.domain)}</td>
      </tr>
      <tr>
        <td style="width:34%;padding:9px 12px;border-bottom:1px solid #e7edf3;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;">Vencimiento</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e7edf3;color:#175cd3;font-size:12px;font-weight:800;">${escapeEmailHtml(dueDate)}</td>
      </tr>
      <tr>
        <td style="width:34%;padding:9px 12px;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;">Total con IVA</td>
        <td style="padding:9px 12px;color:#172033;font-size:12px;font-weight:800;">${escapeEmailHtml(amount)}</td>
      </tr>
    </table>

    <div style="color:#475569;font-size:13px;line-height:1.62;">
      ${editableMessage(input.body)}
    </div>
  `;

  return {
    subject: input.subject,
    text: input.body,
    html: buildVialoopEmailLayout({
      eyebrow: input.reminderLabel,
      title: "Renovación de servicio",
      reference: dueDate,
      preheader: `${input.clientName} · ${input.serviceName} · vence ${dueDate}`,
      content,
      footer:
        "Vialoop Studio SpA · vialoop.cl<br />Control y continuidad de servicios digitales.",
    }),
  };
}
