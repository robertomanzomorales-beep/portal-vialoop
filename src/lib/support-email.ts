import nodemailer from "nodemailer";

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

  const html = `
    <!doctype html>
    <html lang="es">
      <body style="margin:0;padding:0;background-color:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#17304f;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#eef3f8;">
          <tr>
            <td align="center" style="padding:34px 16px;">
              <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background-color:#ffffff;border:1px solid #d8e2ee;border-radius:18px;overflow:hidden;">
                <tr>
                  <td bgcolor="#0b2b50" style="padding:30px 34px;background-color:#0b2b50;color:#ffffff;">
                    <p style="margin:0 0 21px;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:2.2px;line-height:1;">VIALOOP STUDIO</p>
                    <p style="margin:0 0 8px;color:#8bc4ff;font-size:10px;font-weight:700;letter-spacing:1.7px;line-height:1.4;">SOPORTE HOSTING</p>
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;letter-spacing:-0.4px;">Recibimos su solicitud</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 34px 34px;">
                    <p style="margin:0 0 18px;color:#17304f;font-size:14px;line-height:1.7;">Estimado/a <strong>${safeName}</strong>:</p>
                    <p style="margin:0 0 24px;color:#405873;font-size:14px;line-height:1.75;">Hemos recibido correctamente su solicitud. Nuestro equipo revisará los antecedentes y se comunicará con usted por este mismo medio.</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #d9e3ed;border-bottom:1px solid #d9e3ed;">
                      <tr>
                        <td style="padding:15px 0;color:#6b7f96;font-size:12px;">Número de atención</td>
                        <td align="right" style="padding:15px 0;color:#0d3f73;font-size:16px;font-weight:800;">${requestCode}</td>
                      </tr>
                      <tr>
                        <td style="padding:15px 0;border-top:1px solid #e4ebf2;color:#6b7f96;font-size:12px;">Asunto</td>
                        <td align="right" style="padding:15px 0;border-top:1px solid #e4ebf2;color:#17304f;font-size:12px;font-weight:700;">${safeSubject}</td>
                      </tr>
                      <tr>
                        <td style="padding:15px 0;border-top:1px solid #e4ebf2;color:#6b7f96;font-size:12px;">Estado</td>
                        <td align="right" style="padding:15px 0;border-top:1px solid #e4ebf2;color:#176b45;font-size:12px;font-weight:800;">Recibida</td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 10px;color:#405873;font-size:13px;line-height:1.7;">Para mantener el seguimiento, conserve <strong>${requestCode}</strong> en el asunto de sus respuestas.</p>
                    <p style="margin:0 0 24px;color:#6b7f96;font-size:12px;line-height:1.7;">Por seguridad, no envíe contraseñas, claves bancarias ni credenciales de acceso por correo electrónico.</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f4f7fa;border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <p style="margin:0 0 5px;color:#17304f;font-size:13px;font-weight:800;">Soporte Hosting Vialoop</p>
                          <p style="margin:0;color:#6b7f96;font-size:11px;line-height:1.6;">${escapeHtml(supportEmail)} · Lunes a viernes, de 08:00 a 20:00 horas.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

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
