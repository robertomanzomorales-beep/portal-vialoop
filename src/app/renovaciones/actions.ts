"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { confirmRenewalPayment } from "@/lib/renewal-lifecycle";

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
      "/renovaciones?resultado=duplicada",
    );
  }

  const mailResult =
    await sendEmail({
      to: recipient,
      subject,
      text: body,
    }).catch((error) => {
      console.error(
        "Error al enviar el correo de renovación:",
        error,
      );

      redirect(
        "/renovaciones?resultado=error-envio",
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
    `/clientes/${renewal.clientId}`,
  );

  redirect(
    "/renovaciones?resultado=enviada",
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
  const outcome =
    await confirmRenewalPayment({
      renewalId,
      paidAt: getPaymentDate(formData),
      paymentMethod:
        getPaymentMethod(formData),
      createNextRenewal:
        formData.get(
          "createNextRenewal",
        ) === "on",
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
  revalidatePath(
    `/clientes/${outcome.clientId}`,
  );

  if (outcome.subscriptionId) {
    revalidatePath("/suscripciones");
  }

  redirect(
    outcome.state === "already-closed"
      ? "/renovaciones?resultado=ya-cerrada"
      : "/renovaciones?resultado=renovada",
  );
}
