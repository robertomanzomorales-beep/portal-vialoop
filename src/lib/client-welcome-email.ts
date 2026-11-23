import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
} from "@/lib/vialoop-email";

export type ClientWelcomeEmailInput = {
  clientName: string;
  contactName: string;
  subject: string;
  productName: string;
  welcomeMessage: string;
  photoCount: number;
  fileCount: number;
  requirements: string[];
  additionalNotes: string;
};

const DORIS_NAME = "Doris Loayza G.";
const DORIS_ROLE = "Ventas y Gestión Web & Hosting";
export const DORIS_EMAIL = "dloayza@vialoop.cl";

function paragraph(value: string) {
  return escapeEmailHtml(value).replaceAll("\n", "<br />");
}

function quantityLabel(value: number, singular: string, plural: string) {
  if (value <= 0) {
    return "Según alcance acordado";
  }

  return `${value} ${value === 1 ? singular : plural}`;
}

export function buildClientWelcomeEmail(input: ClientWelcomeEmailInput) {
  const greeting = input.contactName.trim()
    ? `Hola ${input.contactName.trim()},`
    : "Hola,";

  const requirementRows = input.requirements
    .map(
      (requirement, index) => `
        <tr>
          <td valign="top" width="32" style="width:32px;padding:7px 0;color:#1e63d7;font-size:11px;font-weight:800;">${String(index + 1).padStart(2, "0")}</td>
          <td valign="top" style="padding:7px 0;border-bottom:1px solid #e5eaf0;color:#334155;font-size:12px;line-height:1.55;">${escapeEmailHtml(requirement)}</td>
        </tr>
      `,
    )
    .join("");

  const notes = input.additionalNotes.trim()
    ? `
      <div style="margin-top:15px;border-left:3px solid #1e63d7;background:#f5f8fc;padding:11px 13px;color:#475569;font-size:12px;line-height:1.6;">
        <strong style="display:block;margin-bottom:3px;color:#172033;font-size:11px;letter-spacing:.04em;text-transform:uppercase;">Consideración para este proyecto</strong>
        ${paragraph(input.additionalNotes.trim())}
      </div>
    `
    : "";

  const content = `
    <p style="margin:0 0 9px;color:#172033;font-size:14px;font-weight:700;line-height:1.55;">${escapeEmailHtml(greeting)}</p>
    <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.65;">${paragraph(input.welcomeMessage)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 16px;border:1px solid #dfe6ee;border-radius:9px;border-collapse:separate;border-spacing:0;background:#f8fafc;">
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #dfe6ee;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Servicio de implementación</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;color:#172033;font-size:14px;font-weight:750;line-height:1.45;">${escapeEmailHtml(input.productName)}</td>
      </tr>
    </table>

    <div style="margin:0 0 8px;color:#172033;font-size:11px;font-weight:800;letter-spacing:.065em;text-transform:uppercase;">Material inicial solicitado</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 15px;border-collapse:collapse;">
      <tr>
        <td class="welcome-material-cell" width="50%" valign="top" style="width:50%;padding:11px 13px;border:1px solid #dfe6ee;background:#ffffff;">
          <div style="color:#64748b;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Fotografías</div>
          <div style="margin-top:4px;color:#172033;font-size:15px;font-weight:800;">${escapeEmailHtml(quantityLabel(input.photoCount, "fotografía", "fotografías"))}</div>
        </td>
        <td class="welcome-material-cell" width="50%" valign="top" style="width:50%;padding:11px 13px;border:1px solid #dfe6ee;border-left:0;background:#ffffff;">
          <div style="color:#64748b;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Archivos o documentos</div>
          <div style="margin-top:4px;color:#172033;font-size:15px;font-weight:800;">${escapeEmailHtml(quantityLabel(input.fileCount, "archivo", "archivos"))}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
      ${requirementRows}
    </table>

    ${notes}

    <p style="margin:16px 0 0;color:#475569;font-size:12.5px;line-height:1.65;">
      Puedes responder este mismo correo adjuntando el material o enviando un enlace de descarga. Cuando lo recibamos, confirmaremos la revisión y el inicio de la implementación.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:18px;border-top:1px solid #e5eaf0;border-collapse:collapse;">
      <tr>
        <td style="padding-top:14px;color:#475569;font-size:12px;line-height:1.55;">
          Saludos cordiales,<br />
          <strong style="color:#172033;font-size:13px;">${DORIS_NAME}</strong><br />
          ${DORIS_ROLE}<br />
          <a href="mailto:${DORIS_EMAIL}" style="color:#1e63d7;text-decoration:none;">${DORIS_EMAIL}</a>
        </td>
      </tr>
    </table>
  `;

  const text = [
    greeting,
    "",
    input.welcomeMessage,
    "",
    `SERVICIO: ${input.productName}`,
    "",
    "MATERIAL INICIAL SOLICITADO",
    `Fotografías: ${quantityLabel(input.photoCount, "fotografía", "fotografías")}`,
    `Archivos o documentos: ${quantityLabel(input.fileCount, "archivo", "archivos")}`,
    ...input.requirements.map((requirement, index) => `${index + 1}. ${requirement}`),
    input.additionalNotes.trim() ? "" : null,
    input.additionalNotes.trim() ? "CONSIDERACIÓN PARA ESTE PROYECTO" : null,
    input.additionalNotes.trim() || null,
    "",
    "Puedes responder este mismo correo adjuntando el material o enviando un enlace de descarga. Cuando lo recibamos, confirmaremos la revisión y el inicio de la implementación.",
    "",
    "Saludos cordiales,",
    DORIS_NAME,
    DORIS_ROLE,
    DORIS_EMAIL,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject: input.subject,
    text,
    html: buildVialoopEmailLayout({
      eyebrow: "Inicio de proyecto",
      title: "Bienvenido(a) a Vialoop",
      reference: "Próximos pasos",
      preheader: `${input.clientName} · Material requerido para iniciar ${input.productName}`,
      content,
      footer:
        "Vialoop Studio SpA · vialoop.cl<br />Coordinación de implementación y contenidos.",
    }),
  };
}
