import nodemailer from "nodemailer";
import {
  buildVialoopEmailLayout,
  normalizeVialoopEmailHtml,
  plainTextEmailContent,
} from "@/lib/vialoop-email";

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

function buildEmailHtml(
  text: string,
  subject: string,
) {
  return buildVialoopEmailLayout({
    eyebrow: "Comunicación Vialoop",
    title: subject,
    preheader: text.replace(/\s+/g, " ").trim().slice(0, 140),
    content: plainTextEmailContent(text),
    footer:
      "Vialoop Studio SpA · vialoop.cl<br />Para consultas, responde directamente a este mensaje.",
  });
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

      html: normalizeVialoopEmailHtml(
        html ??
          buildEmailHtml(
            text,
            subject,
          ),
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
