import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

type ReminderType =
  | "FIRST_NOTICE"
  | "SECOND_NOTICE"
  | "FINAL_NOTICE"
  | "OVERDUE_NOTICE";

type AutomaticEmailMode =
  | "off"
  | "test"
  | "live";

type RenewalCandidate = {
  id: string;
  clientId: string;
  projectId: string | null;
  description: string;
  dueDate: Date;
  amount: unknown;
  status: string;
  notes: string | null;
  client: {
    businessName: string;
    mainContactName: string | null;
    email: string | null;
  };
  project: {
    domain: string | null;
    name: string;
  } | null;
  notifications: Array<{
    type: string;
  }>;
};

type AutomaticRenewalResult = {
  mode: AutomaticEmailMode;
  reviewed: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    renewalId: string;
    client: string;
    recipient: string | null;
    reminderType: ReminderType | null;
    status:
      | "sent"
      | "test-sent"
      | "skipped"
      | "error";
    message: string;
  }>;
};

function getAutomaticEmailMode(): AutomaticEmailMode {
  const value =
    process.env.AUTO_RENEWAL_MODE
      ?.trim()
      .toLowerCase() ??
    "off";

  if (
    value !== "off" &&
    value !== "test" &&
    value !== "live"
  ) {
    return "off";
  }

  return value;
}

function getMaximumEmails() {
  const rawValue =
    process.env
      .AUTO_RENEWAL_MAX_EMAILS ??
    "20";

  const value =
    Number(rawValue);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return 20;
  }

  return Math.min(
    value,
    100,
  );
}

function getRequiredTestRecipient() {
  const value =
    process.env
      .AUTO_RENEWAL_TEST_RECIPIENT
      ?.trim();

  if (!value) {
    throw new Error(
      "Falta configurar AUTO_RENEWAL_TEST_RECIPIENT para utilizar el modo test.",
    );
  }

  return value;
}

function isValidEmail(
  value: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim(),
  );
}

function getChileDateKey(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function dateKeyToUtcMilliseconds(
  dateKey: string,
) {
  return new Date(
    `${dateKey}T00:00:00.000Z`,
  ).getTime();
}

function getDaysDifference(
  dueDate: Date,
  currentDate = new Date(),
) {
  const dueDateKey =
    getChileDateKey(
      dueDate,
    );

  const currentDateKey =
    getChileDateKey(
      currentDate,
    );

  const difference =
    dateKeyToUtcMilliseconds(
      dueDateKey,
    ) -
    dateKeyToUtcMilliseconds(
      currentDateKey,
    );

  return Math.round(
    difference /
      (1000 *
        60 *
        60 *
        24),
  );
}

function formatDate(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function formatCurrency(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Sin monto registrado";
  }

  const amount =
    Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return "Sin monto registrado";
  }

  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(amount);
}

function getGreeting(
  mainContactName:
    | string
    | null,
) {
  const name =
    mainContactName?.trim();

  if (name) {
    return `A la atención de ${name}:`;
  }

  return "Estimados,";
}

function getReminderLabel(
  type: ReminderType,
) {
  const labels: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      "Primer aviso",
    SECOND_NOTICE:
      "Segundo recordatorio",
    FINAL_NOTICE:
      "Recordatorio final",
    OVERDUE_NOTICE:
      "Seguimiento de servicio vencido",
  };

  return labels[type];
}

function getReminderType(
  daysUntilDueDate: number,
): ReminderType {
  if (
    daysUntilDueDate < 0
  ) {
    return "OVERDUE_NOTICE";
  }

  if (
    daysUntilDueDate <= 7
  ) {
    return "FINAL_NOTICE";
  }

  if (
    daysUntilDueDate <= 15
  ) {
    return "SECOND_NOTICE";
  }

  return "FIRST_NOTICE";
}

function isRenewalEligible(
  daysUntilDueDate: number,
) {
  return (
    daysUntilDueDate <= 30
  );
}

function getSubject({
  reminderType,
  domain,
}: {
  reminderType: ReminderType;
  domain: string;
}) {
  const subjects: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      `Aviso de renovación de hosting · ${domain}`,
    SECOND_NOTICE:
      `Segundo aviso: renovación de hosting · ${domain}`,
    FINAL_NOTICE:
      `Recordatorio final: renovación de hosting · ${domain}`,
    OVERDUE_NOTICE:
      `Servicio vencido: renovación de hosting · ${domain}`,
  };

  return subjects[
    reminderType
  ];
}

function getIntroduction(
  reminderType: ReminderType,
) {
  const introductions: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      "Junto con saludar, informamos la próxima renovación del siguiente servicio administrado por Vialoop:",
    SECOND_NOTICE:
      "Junto con saludar, nos ponemos nuevamente en contacto para recordar la próxima renovación del siguiente servicio administrado por Vialoop:",
    FINAL_NOTICE:
      "Junto con saludar, enviamos este recordatorio final respecto de la próxima renovación del siguiente servicio administrado por Vialoop:",
    OVERDUE_NOTICE:
      "Junto con saludar, informamos que el siguiente servicio administrado por Vialoop ha superado su fecha de vencimiento y requiere regularización:",
  };

  return introductions[
    reminderType
  ];
}

function getClosingParagraph(
  reminderType: ReminderType,
) {
  if (
    reminderType ===
    "OVERDUE_NOTICE"
  ) {
    return "Para evitar la suspensión o interrupción del servicio, agradeceremos regularizar el pago a la brevedad.";
  }

  if (
    reminderType ===
    "FINAL_NOTICE"
  ) {
    return "Para mantener la continuidad del servicio y evitar interrupciones, agradeceremos gestionar el pago antes de la fecha indicada.";
  }

  return "Para mantener la continuidad del servicio, agradeceremos gestionar el pago antes de la fecha indicada.";
}

function getEmailBody({
  renewal,
  reminderType,
  domain,
}: {
  renewal: RenewalCandidate;
  reminderType: ReminderType;
  domain: string;
}) {
  return [
    getGreeting(
      renewal.client
        .mainContactName,
    ),
    "",
    getIntroduction(
      reminderType,
    ),
    "",
    `Servicio: ${renewal.description}`,
    `Dominio o proyecto: ${domain}`,
    `Fecha de vencimiento: ${formatDate(
      renewal.dueDate,
    )}`,
    `Monto total con IVA: ${formatCurrency(
      renewal.amount,
    )}`,
    "",
    getClosingParagraph(
      reminderType,
    ),
    "",
    "Datos para transferencia:",
    "",
    "Agencia Publicitaria Vialoop SpA",
    "RUT: 77.103.693-7",
    "Banco: Mercado Pago",
    "Tipo de cuenta: Cuenta Vista",
    "N.º de cuenta: 1074127101",
    "Correo: contacto@vialoop.cl",
    "",
    "Una vez realizado el pago, favor responder este correo adjuntando el comprobante correspondiente.",
    "",
    "Saludos cordiales,",
    "",
    "Equipo Vialoop",
    "Agencia Publicitaria Vialoop SpA",
    "hosting@vialoop.cl",
    "www.vialoop.cl",
  ].join("\n");
}

function hasReminderAlreadyBeenSent(
  renewal: RenewalCandidate,
  reminderType: ReminderType,
) {
  return renewal.notifications.some(
    (notification) =>
      notification.type ===
      reminderType,
  );
}

function getSentOnDate(
  date = new Date(),
) {
  const dateKey =
    getChileDateKey(date);

  return new Date(
    `${dateKey}T12:00:00.000Z`,
  );
}

export async function processAutomaticRenewalEmails(): Promise<AutomaticRenewalResult> {
  const mode =
    getAutomaticEmailMode();

  const result: AutomaticRenewalResult = {
    mode,
    reviewed: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  if (mode === "off") {
    result.details.push({
      renewalId:
        "system",
      client:
        "Sistema",
      recipient:
        null,
      reminderType:
        null,
      status:
        "skipped",
      message:
        "La automatización se encuentra desactivada.",
    });

    return result;
  }

  const testRecipient =
    mode === "test"
      ? getRequiredTestRecipient()
      : null;

  if (
    testRecipient &&
    !isValidEmail(
      testRecipient,
    )
  ) {
    throw new Error(
      "AUTO_RENEWAL_TEST_RECIPIENT no contiene un correo válido.",
    );
  }

  const maximumEmails =
    getMaximumEmails();

  const renewals: RenewalCandidate[] =
    await prisma.renewal.findMany({
      where: {
        status: {
          in: [
            "UPCOMING",
            "NOTIFIED",
            "EXPIRED",
          ],
        },
      },
      orderBy: {
        dueDate: "asc",
      },
      include: {
        client: true,
        project: true,
        notifications: {
          select: {
            type: true,
          },
        },
      },
    });

  result.reviewed =
    renewals.length;

  let processedEmails = 0;

  for (
    const renewal of renewals
  ) {
    const daysUntilDueDate =
      getDaysDifference(
        renewal.dueDate,
      );

    if (
      !isRenewalEligible(
        daysUntilDueDate,
      )
    ) {
      continue;
    }

    result.eligible += 1;

    const reminderType =
      getReminderType(
        daysUntilDueDate,
      );

    if (
      hasReminderAlreadyBeenSent(
        renewal,
        reminderType,
      )
    ) {
      result.skipped += 1;

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient:
          renewal.client.email,
        reminderType,
        status:
          "skipped",
        message:
          `${getReminderLabel(
            reminderType,
          )} ya registrado anteriormente.`,
      });

      continue;
    }

    if (
      processedEmails >=
      maximumEmails
    ) {
      result.skipped += 1;

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient:
          renewal.client.email,
        reminderType,
        status:
          "skipped",
        message:
          "No se procesó porque se alcanzó el límite máximo de correos de esta ejecución.",
      });

      continue;
    }

    const realRecipient =
      renewal.client.email
        ?.trim() ??
      "";

    if (
      !isValidEmail(
        realRecipient,
      )
    ) {
      result.skipped += 1;

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient:
          realRecipient ||
          null,
        reminderType,
        status:
          "skipped",
        message:
          "El cliente no tiene un correo válido registrado.",
      });

      continue;
    }

    if (
      renewal.amount === null ||
      renewal.amount === undefined
    ) {
      result.skipped += 1;

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient:
          realRecipient,
        reminderType,
        status:
          "skipped",
        message:
          "La renovación no tiene un monto registrado.",
      });

      continue;
    }

    const domain =
      renewal.project
        ?.domain ??
      renewal.project
        ?.name ??
      "Servicio Vialoop";

    const originalSubject =
      getSubject({
        reminderType,
        domain,
      });

    const subject =
      mode === "test"
        ? `[PRUEBA AUTOMÁTICA] ${originalSubject}`
        : originalSubject;

    const originalBody =
      getEmailBody({
        renewal,
        reminderType,
        domain,
      });

    const body =
      mode === "test"
        ? [
            "MODO DE PRUEBA",
            "",
            `Destinatario real: ${realRecipient}`,
            `Cliente: ${renewal.client.businessName}`,
            "",
            "El siguiente contenido habría sido enviado al cliente:",
            "",
            originalBody,
          ].join("\n")
        : originalBody;

    const recipient =
      mode === "test"
        ? testRecipient!
        : realRecipient;

    try {
      const mailResult =
        await sendEmail({
          to: recipient,
          subject,
          text: body,
        });

      processedEmails += 1;
      result.sent += 1;

      if (
        mode === "test"
      ) {
        await prisma.activityLog.create({
          data: {
            clientId:
              renewal.clientId,
            projectId:
              renewal.projectId,
            action:
              "AUTOMATIC_RENEWAL_EMAIL_TEST",
            entityType:
              "Renewal",
            entityId:
              renewal.id,
            description:
              `Prueba automática enviada a ${recipient}. El destinatario real habría sido ${realRecipient}.`,
            metadata: {
              mode,
              realRecipient,
              testRecipient:
                recipient,
              reminderType,
              subject,
              smtpMessageId:
                mailResult.messageId,
            },
          },
        });

        result.details.push({
          renewalId:
            renewal.id,
          client:
            renewal.client
              .businessName,
          recipient,
          reminderType,
          status:
            "test-sent",
          message:
            "Prueba enviada. El cliente real no recibió el correo.",
        });

        continue;
      }

      const sentAt =
        new Date();

      const sentOn =
        getSentOnDate(
          sentAt,
        );

      await prisma.$transaction(
        async (transaction) => {
          await transaction
            .renewalNotification
            .create({
              data: {
                renewalId:
                  renewal.id,
                type:
                  reminderType,
                recipient:
                  realRecipient,
                subject:
                  originalSubject,
                body:
                  originalBody,
                sentOn,
                sentAt,
              },
            });

          await transaction.renewal.update({
            where: {
              id:
                renewal.id,
            },
            data: {
              status:
                "NOTIFIED",
              notifiedAt:
                sentAt,
              notes: [
                renewal.notes,
                `${getReminderLabel(
                  reminderType,
                )} automático enviado el ${formatDate(
                  sentAt,
                )}.`,
                `Destinatario: ${realRecipient}.`,
                `SMTP ID: ${mailResult.messageId}.`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          });

          await transaction.activityLog.create({
            data: {
              clientId:
                renewal.clientId,
              projectId:
                renewal.projectId,
              action:
                "AUTOMATIC_RENEWAL_EMAIL_SENT",
              entityType:
                "Renewal",
              entityId:
                renewal.id,
              description:
                `${getReminderLabel(
                  reminderType,
                )} automático enviado a ${realRecipient}.`,
              metadata: {
                mode,
                recipient:
                  realRecipient,
                reminderType,
                subject:
                  originalSubject,
                smtpMessageId:
                  mailResult.messageId,
                accepted:
                  mailResult.accepted,
                rejected:
                  mailResult.rejected,
                smtpResponse:
                  mailResult.response,
              },
            },
          });
        },
      );

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient:
          realRecipient,
        reminderType,
        status:
          "sent",
        message:
          "Correo automático enviado y registrado correctamente.",
      });
    } catch (error) {
      result.errors += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido durante el envío.";

      console.error(
        `Error en renovación automática ${renewal.id}:`,
        error,
      );

      result.details.push({
        renewalId:
          renewal.id,
        client:
          renewal.client
            .businessName,
        recipient,
        reminderType,
        status:
          "error",
        message,
      });
    }
  }

  return result;
}