import nodemailer from "nodemailer";
import { buildVialoopEmailLayout } from "@/lib/vialoop-email";

type SupportAcknowledgementInput = {
  to: string;
  recipientName?: string | null;
  requestNumber: number;
  requestSubject: string;
  originalMessageId?: string | null;
};

function getEnvironmentVariable(
  primaryName: string,
  fallbackName: string,
) {
  const value =
    process.env[primaryName]?.trim() ||
    process.env[fallbackName]?.trim();

  if (!value) {
    throw new Error(
      `La variable ${primaryName} no está configurada.`,
    );
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRequestNumber(number: number) {
  return `#${number.toString().padStart(4, "0")}`;
}

function getTransporter() {
  const host = getEnvironmentVariable(
    "SUPPORT_SMTP_HOST",
    "SMTP_HOST",
  );
  const port = Number(
    getEnvironmentVariable(
      "SUPPORT_SMTP_PORT",
      "SMTP_PORT",
    ),
  );
  const user = getEnvironmentVariable(
    "SUPPORT_SMTP_USER",
    "SMTP_USER",
  );
  const password =
    process.env.SUPPORT_SMTP_PASSWORD?.trim() ||
    process.env.SMTP_PASSWORD?.trim() ||
    process.env.SMTP_PASS?.trim();

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT debe contener un puerto válido.");
  }

  if (!password) {
    throw new Error(
      "SMTP_PASSWORD no está configurada en el entorno.",
    );
  }

  const secureValue =
    process.env.SUPPORT_SMTP_SECURE
      ?.trim()
      .toLowerCase() ||
    process.env.SMTP_SECURE?.trim().toLowerCase();

  return nodemailer.createTransport({
    host,
    port,
    secure:
      secureValue === "true" ||
      (secureValue !== "false" && port === 465),
    auth: {
      user,
      pass: password,
    },
  });
}

export async function sendSupportAcknowledgement({
  to,
  recipientName,
  requestNumber,
  requestSubject,
  originalMessageId,
}: SupportAcknowledgementInput) {
  const supportEmail =
    process.env.SUPPORT_FROM_EMAIL?.trim() ||
    "hosting@vialoop.cl";
  const requestCode = formatRequestNumber(requestNumber);
  const safeName = escapeHtml(recipientName?.trim() || "Cliente");
  const safeSubject = escapeHtml(requestSubject);

  const subject = `[Atención ${requestCode}] Solicitud recibida por Soporte Vialoop`;

  const text = [
    `Estimado/a ${recipientName?.trim() || "cliente"}:`,
    "",
    "Hemos recibido correctamente su solicitud de soporte.",
    "",
    `Número de atención: ${requestCode}`,
    `Asunto: ${requestSubject}`,
    "Estado: Recibida",
    "",
    "Nuestro equipo revisará los antecedentes y se comunicará con usted por este mismo medio.",
    "Para mantener el seguimiento, conserve el número de atención en el asunto de sus respuestas.",
    "",
    "Por seguridad, no envíe contraseñas, claves bancarias ni credenciales de acceso por correo electrónico.",
    "",
    "Soporte Hosting Vialoop",
    supportEmail,
    "Atención: lunes a viernes, de 08:00 a 20:00 horas.",
  ].join("\n");

  const html = buildVialoopEmailLayout({
    eyebrow: "Soporte Hosting",
    title: "Recibimos su solicitud",
    reference: requestCode,
    preheader: `${requestCode} · ${requestSubject} · Solicitud recibida`,
    content: `
      <p style="margin:0 0 8px;color:#172033;font-size:14px;font-weight:700;line-height:1.55;">
        Estimado/a <strong>${safeName}</strong>:
      </p>
      <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.65;">
        Hemos recibido correctamente su solicitud. Nuestro equipo revisará los antecedentes y se comunicará con usted por este mismo medio.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #dfe6ee;border-collapse:collapse;background:#ffffff;">
        <tr>
          <td style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Número de atención</td>
          <td align="right" style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:12px;font-weight:800;">${requestCode}</td>
        </tr>
        <tr>
          <td style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Asunto</td>
          <td align="right" style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${safeSubject}</td>
        </tr>
        <tr>
          <td style="padding:9px 13px;color:#64748b;font-size:11px;">Estado</td>
          <td align="right" style="padding:9px 13px;color:#245bd6;font-size:11px;font-weight:800;">Recibida</td>
        </tr>
      </table>
      <p style="margin:16px 0 8px;color:#475569;font-size:12px;line-height:1.65;">
        Para mantener el seguimiento, conserve <strong>${requestCode}</strong> en el asunto de sus respuestas.
      </p>
      <p style="margin:0;color:#64748b;font-size:11px;line-height:1.65;">
        Por seguridad, no envíe contraseñas, claves bancarias ni credenciales de acceso por correo electrónico.
      </p>
    `,
    footer: `<strong style="color:#172033;">Soporte Hosting Vialoop</strong><br />${escapeHtml(supportEmail)} · Lunes a viernes, de 08:00 a 20:00 horas.`,
  });

  return getTransporter().sendMail({
    from: `Vialoop Soporte <${supportEmail}>`,
    to,
    replyTo: supportEmail,
    subject,
    text,
    html,
    inReplyTo: originalMessageId || undefined,
    references: originalMessageId
      ? [originalMessageId]
      : undefined,
  });
}
