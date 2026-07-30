import nodemailer from "nodemailer";

export type EmailAccount =
  | "default"
  | "payments"
  | "billing";

type EmailAttachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  mailAccount?: EmailAccount;
  attachments?: EmailAttachment[];
};

type MailConfiguration = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

function getRequiredEnvironmentVariable(
  name: string,
) {
  const value =
    process.env[name];

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

function getOptionalEnvironmentVariable(
  name: string,
) {
  const value =
    process.env[name]?.trim();

  return value &&
    value.length > 0
    ? value
    : undefined;
}

function parseSmtpPort(
  rawPort: string,
  variableName: string,
) {
  const port =
    Number(rawPort);

  if (
    !Number.isInteger(port) ||
    port <= 0
  ) {
    throw new Error(
      `La variable ${variableName} no contiene un puerto válido.`,
    );
  }

  return port;
}

function getAccountPrefix(
  account: EmailAccount,
) {
  if (
    account === "payments"
  ) {
    return "PAYMENTS_SMTP";
  }

  if (
    account === "billing"
  ) {
    return "BILLING_SMTP";
  }

  return "SMTP";
}

function getDefaultAccountName(
  account: EmailAccount,
) {
  if (
    account === "payments"
  ) {
    return "Vialoop Pagos";
  }

  if (
    account === "billing"
  ) {
    return "Vialoop Facturación";
  }

  return "Vialoop Hosting";
}

function getMailConfiguration(
  account: EmailAccount,
): MailConfiguration {
  const prefix =
    getAccountPrefix(account);

  const host =
    getOptionalEnvironmentVariable(
      `${prefix}_HOST`,
    ) ||
    getRequiredEnvironmentVariable(
      "SMTP_HOST",
    );

  const accountPort =
    getOptionalEnvironmentVariable(
      `${prefix}_PORT`,
    );

  const defaultPort =
    getOptionalEnvironmentVariable(
      "SMTP_PORT",
    ) ||
    "465";

  const port =
    parseSmtpPort(
      accountPort ||
        defaultPort,
      accountPort
        ? `${prefix}_PORT`
        : "SMTP_PORT",
    );

  const user =
    getRequiredEnvironmentVariable(
      `${prefix}_USER`,
    );

  const password =
    getRequiredEnvironmentVariable(
      `${prefix}_PASSWORD`,
    );

  const fromEmail =
    getOptionalEnvironmentVariable(
      `${prefix}_FROM_EMAIL`,
    ) ||
    user;

  const fromName =
    getOptionalEnvironmentVariable(
      `${prefix}_FROM_NAME`,
    ) ||
    getDefaultAccountName(
      account,
    );

  const replyTo =
    getOptionalEnvironmentVariable(
      `${prefix}_REPLY_TO`,
    ) ||
    fromEmail;

  return {
    host,
    port,
    user,
    password,
    fromEmail,
    fromName,
    replyTo,
  };
}

function normalizeEmail(
  value?: string,
) {
  return value
    ?.trim()
    .toLowerCase();
}

function resolveMailAccount(
  requestedAccount?: EmailAccount,
  fromEmail?: string,
): EmailAccount {
  if (requestedAccount) {
    return requestedAccount;
  }

  const normalizedFromEmail =
    normalizeEmail(fromEmail);

  if (!normalizedFromEmail) {
    return "default";
  }

  const paymentsEmails = [
    "pagos@vialoop.cl",
    normalizeEmail(
      process.env
        .PAYMENTS_SMTP_USER,
    ),
    normalizeEmail(
      process.env
        .PAYMENTS_SMTP_FROM_EMAIL,
    ),
  ].filter(Boolean);

  if (
    paymentsEmails.includes(
      normalizedFromEmail,
    )
  ) {
    return "payments";
  }

  const billingEmails = [
    "facturacion@vialoop.cl",
    normalizeEmail(
      process.env
        .BILLING_SMTP_USER,
    ),
    normalizeEmail(
      process.env
        .BILLING_SMTP_FROM_EMAIL,
    ),
  ].filter(Boolean);

  if (
    billingEmails.includes(
      normalizedFromEmail,
    )
  ) {
    return "billing";
  }

  return "default";
}

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
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
    convertPlainTextToHtml(
      text,
    );

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
          Vialoop
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
                      Vialoop
                    </div>

                    <div
                      style="
                        margin-top:6px;
                        font-size:13px;
                        color:#cbd5e1;
                      "
                    >
                      Administración de servicios, pagos y facturación
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

function createTransporter(
  account: EmailAccount,
) {
  const configuration =
    getMailConfiguration(
      account,
    );

  const transporter =
    nodemailer.createTransport({
      host:
        configuration.host,

      port:
        configuration.port,

      secure:
        configuration.port ===
        465,

      auth: {
        user:
          configuration.user,

        pass:
          configuration.password,
      },
    });

  return {
    transporter,
    configuration,
  };
}

export async function verifyMailConnection(
  account: EmailAccount =
    "default",
) {
  const {
    transporter,
  } =
    createTransporter(
      account,
    );

  await transporter.verify();
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  fromEmail,
  fromName,
  replyTo,
  mailAccount,
  attachments,
}: SendEmailInput) {
  const resolvedAccount =
    resolveMailAccount(
      mailAccount,
      fromEmail,
    );

  const {
    transporter,
    configuration,
  } =
    createTransporter(
      resolvedAccount,
    );

  const resolvedFromEmail =
    fromEmail?.trim() ||
    configuration.fromEmail;

  const resolvedFromName =
    fromName?.trim() ||
    configuration.fromName;

  const resolvedReplyTo =
    replyTo?.trim() ||
    configuration.replyTo;

  const preparedAttachments =
    attachments?.map(
      (attachment) => ({
        filename:
          attachment.filename,

        content:
          Buffer.from(
            attachment.content,
          ),

        contentType:
          attachment.contentType,
      }),
    );

  const result =
    await transporter.sendMail({
      from: {
        name:
          resolvedFromName,

        address:
          resolvedFromEmail,
      },

      to,

      replyTo:
        resolvedReplyTo,

      subject,

      text,

      html:
        html ??
        buildEmailHtml(
          text,
        ),

      attachments:
        preparedAttachments,
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

    account:
      resolvedAccount,
  };
}