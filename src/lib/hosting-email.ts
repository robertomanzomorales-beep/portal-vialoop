import {
  buildVialoopEmailLayout,
  escapeEmailHtml,
  normalizeVialoopEmailHtml,
} from "@/lib/vialoop-email";

export const HOSTING_EMAIL_ADDRESS = "hosting@vialoop.cl";
export const HOSTING_EMAIL_SENDER = "Hosting Vialoop";
export const HOSTING_EMAIL_SUBJECT_LIMIT = 180;
export const HOSTING_EMAIL_BODY_LIMIT = 7000;

export const hostingEmailTemplates = {
  libre: { label: "Mensaje libre", subject: "", body: "" },
  soporte: {
    label: "Actualización de soporte",
    subject: "Actualización sobre su servicio de hosting",
    body: "Le escribimos para actualizar el estado de su solicitud.\n\nServicio o dominio: [servicio o dominio]\nRevisión realizada: [detalle de la revisión]\nPróximo paso: [próximo paso]",
  },
  mantenimiento: {
    label: "Aviso de mantenimiento",
    subject: "Aviso de mantenimiento programado",
    body: "Le informamos que realizaremos un mantenimiento programado.\n\nServicio o dominio: [servicio o dominio]\nFecha y horario (Chile): [fecha y horario]\nImpacto previsto: [impacto previsto]\n\nSi tiene consultas sobre esta ventana, puede responder a este correo.",
  },
  renovacion: {
    label: "Confirmación de renovación",
    subject: "Confirmación de renovación de hosting",
    body: "Le confirmamos la renovación de su servicio de hosting.\n\nServicio o dominio: [servicio o dominio]\nPróximo vencimiento: [fecha de vencimiento]\n\nGracias por continuar con Vialoop. Si necesita ayuda con su servicio, puede responder a este correo.",
  },
  bienvenida: {
    label: "Bienvenida a Hosting",
    subject: "Bienvenida a Hosting Vialoop",
    body: "Gracias por confiar en Vialoop para el alojamiento de su sitio.\n\nServicio o dominio: [servicio o dominio]\nPróximos pasos: [próximo paso]\n\nPuede responder a este correo para solicitar ayuda con el sitio, el dominio o el correo de su empresa.",
  },
} as const;

export type HostingEmailTemplate = keyof typeof hostingEmailTemplates;

const templateFields = Object.values(hostingEmailTemplates).flatMap(
  ({ body }) => body.match(/\[[^\]\n]+\]/g) ?? [],
);

export function isHostingEmailTemplate(value: string): value is HostingEmailTemplate {
  return Object.hasOwn(hostingEmailTemplates, value);
}

export function hasUnfilledHostingFields(message: string) {
  return templateFields.some((field) => message.includes(field));
}

export function buildHostingEmail({ subject, message }: { subject: string; message: string }) {
  const body = message.trim();
  const paragraphs = body.split(/(?:\r?\n){2,}/);
  const signature = ["Saludos cordiales,", HOSTING_EMAIL_SENDER, HOSTING_EMAIL_ADDRESS, "vialoop.cl"];
  const content = paragraphs
    .map((paragraph) => `<p style="margin:0 0 13px;color:#344054;font-size:14px;line-height:1.65;overflow-wrap:anywhere;word-wrap:break-word;">${escapeEmailHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");

  const html = buildVialoopEmailLayout({
    eyebrow: "Hosting y soporte",
    title: subject,
    preheader: body.replace(/\s+/g, " ").slice(0, 140),
    content: `${content}<p style="margin:19px 0 0;border-top:1px solid #e5eaf0;padding-top:13px;color:#475467;font-size:12px;line-height:1.55;">Saludos cordiales,<br /><strong style="color:#172033;">${HOSTING_EMAIL_SENDER}</strong><br /><a href="mailto:${HOSTING_EMAIL_ADDRESS}" style="color:#345a86;text-decoration:none;">${HOSTING_EMAIL_ADDRESS}</a></p>`,
    footer: 'Vialoop Studio SpA · <a href="https://vialoop.cl" style="color:#345a86;text-decoration:none;">vialoop.cl</a>',
  });

  return {
    text: `${body}\n\n${signature.join("\n")}`,
    html: normalizeVialoopEmailHtml(html),
  };
}
