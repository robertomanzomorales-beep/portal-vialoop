"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { confirmRenewalPayment } from "@/lib/renewal-lifecycle";
import { buildRenewalConfirmationEmail } from "@/lib/renewal-confirmation-email";
import { buildRenewalNoticeEmail } from "@/lib/renewal-notice-email";

type ReminderType =
  | "FIRST_NOTICE"
  | "SECOND_NOTICE"
  | "FINAL_NOTICE"
  | "OVERDUE_NOTICE"
  | "MANUAL";

const allowedReminderTypes: ReminderType[] = [
  "FIRST_NOTICE",
  "SECOND_NOTICE",
  "FINAL_NOTICE",
  "OVERDUE_NOTICE",
  "MANUAL",
];

function getRequiredString(
  formData: FormData,
  field: string,
  label: string,
) {
  const value =
    formData.get(field);

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${label} es obligatorio.`,
    );
  }

  return value.trim();
}

function getReminderType(
  formData: FormData,
): ReminderType {
  const value =
    getRequiredString(
      formData,
      "reminderType",
      "El tipo de recordatorio",
    );

  if (
    !allowedReminderTypes.includes(
      value as ReminderType,
    )
  ) {
    throw new Error(
      "El tipo de recordatorio no es válido.",
    );
  }

  return value as ReminderType;
}

function appendNote(
  currentNotes: string | null,
  newNote: string,
) {
  return [
    currentNotes,
    newNote,
  ]
    .filter(Boolean)
    .join("\n");
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

function getChileDateKey(
  date = new Date(),
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

    MANUAL:
      "Aviso manual",
  };

  return labels[type];
}

function validateEmailAddress(
  email: string,
) {
  const pattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return pattern.test(email);
}

function getSentOnDate(
  date: Date,
) {
  const dateKey =
    getChileDateKey(date);

  return new Date(
    `${dateKey}T12:00:00.000Z`,
  );
}

function getReturnPath(
  formData: FormData,
  result: string,
) {
  const value = formData.get("returnTo");
  const fallback = "/renovaciones";
  const requested =
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
      ? value
      : fallback;
  const [path, hash] = requested.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}resultado=${encodeURIComponent(result)}${
    hash ? `#${hash}` : ""
  }`;
}

function getRenewalServiceLabel(type: string) {
  const labels: Record<string, string> = {
    DOMAIN: "Dominio",
    HOSTING: "Hosting",
    EMAIL: "Correo",
    SSL: "Certificado SSL",
    SUBSCRIPTION: "Suscripción",
    ADDITIONAL_SERVICE: "Servicio adicional",
  };

  return labels[type] ?? "Servicio";
}

export async function generatePaymentFromRenewal(
  renewalId: string,
) {
  await requireUser();

  const renewal =
    await prisma.renewal.findUnique({
      where: {
        id: renewalId,
      },

      include: {
        client: true,
        project: true,
      },
    });

  if (!renewal) {
    throw new Error(
      "La renovación seleccionada no existe.",
    );
  }

  if (
    renewal.amount === null
  ) {
    throw new Error(
      "La renovación no tiene un monto registrado. Debes editarla antes de generar el cobro.",
    );
  }

  if (
    renewal.status === "PAID" ||
    renewal.status === "RENEWED" ||
    renewal.status === "CANCELLED"
  ) {
    throw new Error(
      "No se puede generar un cobro para una renovación cerrada.",
    );
  }

  const reference =
    `renewal:${renewal.id}`;

  const existingPayment =
    await prisma.payment.findFirst({
      where: {
        clientId:
          renewal.clientId,

        reference,

        status: {
          in: [
            "PENDING",
            "OVERDUE",
            "PAID",
          ],
        },
      },
    });

  if (existingPayment) {
    redirect(
      "/pagos?resultado=existente",
    );
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  await prisma.payment.create({
    data: {
      clientId:
        renewal.clientId,

      subscriptionId:
        renewal.subscriptionId,

      description:
        renewal.description,

      amount:
        renewal.amount,

      dueDate:
        renewal.dueDate,

      status:
        renewal.dueDate < today
          ? "OVERDUE"
          : "PENDING",

      reference,

      notes: [
        `Cobro generado desde la renovación ${renewal.id}.`,

        renewal.project?.domain
          ? `Dominio: ${renewal.project.domain}.`
          : null,

        renewal.notes,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  });

  revalidatePath("/");
  revalidatePath(
    "/renovaciones",
  );
  revalidatePath(
    "/pagos",
  );
  revalidatePath(
    "/seguimiento",
  );
  revalidatePath(
    `/clientes/${renewal.clientId}`,
  );

  redirect(
    "/pagos?resultado=creado",
  );
}

export async function markRenewalAsNotified(
  renewalId: string,
  formData: FormData,
) {
  await requireUser();

  const recipient =
    getRequiredString(
      formData,
      "recipient",
      "El destinatario",
    );

  const subject =
    getRequiredString(
      formData,
      "subject",
      "El asunto",
    );

  const body =
    getRequiredString(
      formData,
      "body",
      "El contenido del correo",
    );

  const reminderType =
    getReminderType(
      formData,
    );

  if (
    !validateEmailAddress(
      recipient,
    )
  ) {
    throw new Error(
      "El correo del destinatario no es válido.",
    );
  }

  const renewal =
    await prisma.renewal.findUnique({
      where: {
        id: renewalId,
      },

      include: {
        client: true,
        project: true,
      },
    });

  if (!renewal) {
    throw new Error(
      "La renovación seleccionada no existe.",
    );
  }

  if (
    renewal.status === "PAID" ||
    renewal.status === "RENEWED" ||
    renewal.status === "CANCELLED"
  ) {
    throw new Error(
      "No se puede notificar una renovación cerrada.",
    );
  }

  const notifiedAt =
    new Date();

  const sentOn =
    getSentOnDate(
      notifiedAt,
    );

  const existingNotification =
    await prisma.renewalNotification.findFirst({
      where: {
        renewalId:
          renewal.id,

        type:
          reminderType,

        sentOn,
      },
    });

  if (
    existingNotification
  ) {
    redirect(
      getReturnPath(formData, "duplicada"),
    );
  }

  const domain =
    renewal.project?.domain ??
    renewal.project?.name ??
    renewal.client.tradeName ??
    renewal.client.businessName;
  const email = buildRenewalNoticeEmail({
    subject,
    body,
    clientName: renewal.client.tradeName || renewal.client.businessName,
    serviceName: getRenewalServiceLabel(renewal.type),
    domain,
    dueDate: renewal.dueDate,
    amount: renewal.amount === null ? null : Number(renewal.amount),
    reminderLabel: getReminderLabel(reminderType),
  });

  const mailResult =
    await sendEmail({
      to: recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromEmail: "hosting@vialoop.cl",
      fromName: "Vialoop Hosting",
      replyTo: "hosting@vialoop.cl",
    }).catch((error) => {
      console.error(
        "Error al enviar el correo de renovación:",
        error,
      );

      redirect(
        getReturnPath(formData, "error-envio"),
      );
    });

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

            recipient,

            subject,

            body,

            sentOn,

            sentAt:
              notifiedAt,
          },
        });

      await transaction
        .renewal.update({
          where: {
            id:
              renewal.id,
          },

          data: {
            status:
              "NOTIFIED",

            notifiedAt,

            notes:
              appendNote(
                renewal.notes,
                [
                  `${getReminderLabel(
                    reminderType,
                  )} enviado el ${formatDate(
                    notifiedAt,
                  )}.`,

                  `Destinatario: ${recipient}.`,

                  `Asunto: ${subject}.`,

                  `SMTP ID: ${mailResult.messageId}.`,
                ].join("\n"),
              ),
          },
        });

      await transaction
        .activityLog
        .create({
          data: {
            clientId:
              renewal.clientId,

            projectId:
              renewal.projectId,

            action:
              "RENEWAL_EMAIL_SENT",

            entityType:
              "Renewal",

            entityId:
              renewal.id,

            description:
              `${getReminderLabel(
                reminderType,
              )} enviado a ${recipient}.`,

            metadata: {
              recipient,

              subject,

              reminderType,

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

  revalidatePath("/");
  revalidatePath(
    "/renovaciones",
  );
  revalidatePath(
    "/pagos",
  );
  revalidatePath(
    "/seguimiento",
  );
  revalidatePath(
    `/clientes/${renewal.clientId}`,
  );

  redirect(
    getReturnPath(formData, "enviada"),
  );
}

const paymentMethods = [
  "BANK_TRANSFER",
  "FLOW",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CASH",
  "OTHER",
] as const;

function getPaymentDate(
  formData: FormData,
) {
  const value = formData.get("paidAt");

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      "La fecha de pago ingresada no es válida.",
    );
  }

  const paidAt = new Date(
    `${value}T12:00:00.000Z`,
  );

  if (Number.isNaN(paidAt.getTime())) {
    throw new Error(
      "La fecha de pago ingresada no es válida.",
    );
  }

  return paidAt;
}

function getPaymentMethod(
  formData: FormData,
) {
  const value = formData.get(
    "paymentMethod",
  );

  return paymentMethods.includes(
    value as (typeof paymentMethods)[number],
  )
    ? (value as (typeof paymentMethods)[number])
    : "BANK_TRANSFER";
}

export async function confirmRenewalAsPaid(
  renewalId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const paidAt = getPaymentDate(formData);
  const createNextRenewal =
    formData.get(
      "createNextRenewal",
    ) === "on";
  const sendConfirmation = formData.get("sendConfirmation") === "on";
  const recipient = sendConfirmation
    ? getRequiredString(formData, "confirmationRecipient", "El destinatario")
    : "";
  const confirmationSubject = sendConfirmation
    ? getRequiredString(formData, "confirmationSubject", "El asunto")
    : "";
  const confirmationMessage = sendConfirmation
    ? getRequiredString(formData, "confirmationMessage", "El mensaje")
    : "";

  if (sendConfirmation && !validateEmailAddress(recipient)) {
    throw new Error("El correo de confirmación no es válido.");
  }
  if (confirmationSubject.length > 180 || confirmationMessage.length > 3000) {
    throw new Error("El asunto o el mensaje de confirmación es demasiado extenso.");
  }

  const outcome =
    await confirmRenewalPayment({
      renewalId,
      paidAt,
      paymentMethod:
        getPaymentMethod(formData),
      createNextRenewal,
      userId: user.id,
    });

  if (
    outcome.state === "missing" ||
    !outcome.clientId
  ) {
    throw new Error(
      "La renovación seleccionada ya no existe.",
    );
  }

  revalidatePath("/");
  revalidatePath("/renovaciones");
  revalidatePath("/pagos");
  revalidatePath("/seguimiento");
  revalidatePath(
    `/clientes/${outcome.clientId}`,
  );

  if (outcome.subscriptionId) {
    revalidatePath("/suscripciones");
  }

  let confirmationStatus: "skipped" | "sent" | "failed" = "skipped";

  if (sendConfirmation && outcome.state === "reconciled") {
    const renewal = await prisma.renewal.findUnique({
      where: { id: renewalId },
      include: { client: true, project: true },
    });

    if (renewal) {
      const domain =
        renewal.project?.domain ||
        renewal.project?.name ||
        renewal.client.tradeName ||
        renewal.client.businessName;
      const amount = renewal.amount === null
        ? "Sin monto informado"
        : new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            maximumFractionDigits: 0,
          }).format(Number(renewal.amount));
      const email = buildRenewalConfirmationEmail({
        subject: confirmationSubject,
        contactName: renewal.client.mainContactName ?? "",
        clientName: renewal.client.tradeName || renewal.client.businessName,
        serviceName: renewal.description,
        domain,
        amount,
        paidAt,
        nextDueDate: outcome.nextDueDate,
        message: confirmationMessage,
      });

      try {
        const mailResult = await sendEmail({
          to: recipient,
          subject: email.subject,
          text: email.text,
          html: email.html,
          fromEmail: "hosting@vialoop.cl",
          fromName: "Vialoop Hosting",
          replyTo: "hosting@vialoop.cl",
        });

        confirmationStatus = "sent";
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            clientId: renewal.clientId,
            projectId: renewal.projectId,
            action: "RENEWAL_CONFIRMATION_SENT",
            entityType: "Renewal",
            entityId: renewal.id,
            description: `Confirmación de renovación enviada a ${recipient}.`,
            metadata: {
              recipient,
              subject: email.subject,
              smtpMessageId: mailResult.messageId,
              accepted: mailResult.accepted,
              rejected: mailResult.rejected,
            },
          },
        });
      } catch (error) {
        confirmationStatus = "failed";
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            clientId: renewal.clientId,
            projectId: renewal.projectId,
            action: "RENEWAL_CONFIRMATION_FAILED",
            entityType: "Renewal",
            entityId: renewal.id,
            description: `La renovación se cerró, pero no fue posible enviar la confirmación a ${recipient}.`,
            metadata: {
              recipient,
              subject: confirmationSubject,
              error: error instanceof Error ? error.message : "Error de envío",
            },
          },
        });
      }
    }
  }

  const baseResult = createNextRenewal ? "renovada" : "pagada";
  const result =
    outcome.state === "already-closed"
      ? "ya-cerrada"
      : confirmationStatus === "sent"
        ? `${baseResult}-confirmada`
        : confirmationStatus === "failed"
          ? `${baseResult}-correo-error`
          : baseResult;

  redirect(getReturnPath(formData, result));
}
