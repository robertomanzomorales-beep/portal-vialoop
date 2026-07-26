import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function getRequiredEnvironmentVariable(
  name: string,
) {
  const value = process.env[name];

  if (
    !value ||
    value.trim().length === 0
  ) {
    throw new Error(
      `Falta configurar la variable de entorno ${name}.`,
    );
  }

  return value.trim();
}

function getSmtpPort() {
  const rawPort =
    process.env.SMTP_PORT ?? "465";

  const port = Number(rawPort);

  if (
    !Number.isInteger(port) ||
    port <= 0
  ) {
    throw new Error(
      "La variable SMTP_PORT no contiene un puerto válido.",
    );
  }

  return port;
}

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function convertPlainTextToHtml(
  text: string,
) {
  const escapedText =
    escapeHtml(text);

  return escapedText
    .split(/\r?\n/)
    .map((line) => {
      if (
        line.trim().length === 0
      ) {
        return `
          <div
            style="
              height:8px;
            "
          ></div>
        `;
      }

      return `
        <p
          style="
            margin:0 0 16px;
            line-height:1.65;
          "
        >
          ${line}
        </p>
      `;
    })
    .join("");
}

function buildEmailHtml(
  text: string,
) {
  const content =
    convertPlainTextToHtml(text);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          Vialoop Hosting
        </title>
      </head>

      <body
        style="
          margin:0;
          padding:0;
          background:#f2f4f7;
          font-family:Arial,Helvetica,sans-serif;
          color:#18212f;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="
            width:100%;
            background:#f2f4f7;
            padding:32px 16px;
          "
        >
          <tr>
            <td align="center">
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="
                  width:100%;
                  max-width:640px;
                  background:#ffffff;
                  border-radius:14px;
                  overflow:hidden;
                  border:1px solid #e3e7ed;
                "
              >
                <tr>
                  <td
                    style="
                      padding:26px 32px;
                      background:#111827;
                      color:#ffffff;
                    "
                  >
                    <div
                      style="
                        font-size:22px;
                        font-weight:700;
                        letter-spacing:-0.3px;
                      "
                    >
                      Vialoop Hosting
                    </div>

                    <div
                      style="
                        margin-top:6px;
                        font-size:13px;
                        color:#cbd5e1;
                      "
                    >
                      Administración de servicios y renovaciones
                    </div>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:34px 32px 18px;
                      font-size:15px;
                    "
                  >
                    ${content}
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:22px 32px 30px;
                      font-size:13px;
                      line-height:1.6;
                      color:#667085;
                      border-top:1px solid #edf0f4;
                    "
                  >
                    Este correo fue enviado desde el sistema de
                    administración de Vialoop.

                    <br />

                    Para consultas, responde directamente a este mensaje.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function createTransporter() {
  const host =
    getRequiredEnvironmentVariable(
      "SMTP_HOST",
    );

  const port =
    getSmtpPort();

  const user =
    getRequiredEnvironmentVariable(
      "SMTP_USER",
    );

  const password =
    getRequiredEnvironmentVariable(
      "SMTP_PASSWORD",
    );

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: password,
    },
  });
}

export async function verifyMailConnection() {
  const transporter =
    createTransporter();

  await transporter.verify();
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailInput) {
  const transporter =
    createTransporter();

  const fromEmail =
    process.env.SMTP_FROM_EMAIL?.trim() ||
    getRequiredEnvironmentVariable(
      "SMTP_USER",
    );

  const fromName =
    process.env.SMTP_FROM_NAME?.trim() ||
    "Vialoop Hosting";

  const replyTo =
    process.env.SMTP_REPLY_TO?.trim() ||
    fromEmail;

  const result =
    await transporter.sendMail({
      from: {
        name: fromName,
        address: fromEmail,
      },
      to,
      replyTo,
      subject,
      text,
      html:
        html ??
        buildEmailHtml(text),
    });

  if (!result.messageId) {
    throw new Error(
      "El servidor SMTP no confirmó correctamente el envío.",
    );
  }

  return {
    messageId:
      result.messageId,

    accepted:
      result.accepted.map(
        String,
      ),

    rejected:
      result.rejected.map(
        String,
      ),

    response:
      result.response,
  };
}