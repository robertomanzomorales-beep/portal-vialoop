"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

function getOptionalString(
  formData: FormData,
  field: string,
) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : null;
}

function getBoolean(
  formData: FormData,
  field: string,
) {
  return formData.get(field) === "on";
}

function getPaymentMethod(
  formData: FormData,
): PaymentMethodValue {
  const value = getOptionalString(
    formData,
    "paymentMethod",
  );

  const allowedMethods: PaymentMethodValue[] = [
    "BANK_TRANSFER",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "CASH",
    "OTHER",
  ];

  if (
    value &&
    allowedMethods.includes(
      value as PaymentMethodValue,
    )
  ) {
    return value as PaymentMethodValue;
  }

  return "BANK_TRANSFER";
}

function getPaymentDate(formData: FormData) {
  const value = getOptionalString(
    formData,
    "paidAt",
  );

  if (!value) {
    return new Date();
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "La fecha de pago ingresada no es válida.",
    );
  }

  return date;
}

function getPaymentAmount(
  formData: FormData,
  currentAmount: unknown,
) {
  const value = getOptionalString(
    formData,
    "paidAmount",
  );

  if (!value) {
    return Number(currentAmount);
  }

  const amount = Number(
    value.replace(/[^\d.-]/g, ""),
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "El monto recibido debe ser mayor que cero.",
    );
  }

  return Math.round(amount);
}

function addOneYear(date: Date) {
  const result = new Date(date);
  const originalMonth = result.getMonth();

  result.setFullYear(result.getFullYear() + 1);

  /*
   * Control para fechas como 29 de febrero.
   * Si el año siguiente no tiene esa fecha,
   * utiliza el último día válido del mes.
   */
  if (result.getMonth() !== originalMonth) {
    result.setDate(0);
  }

  return result;
}

function appendNote(
  currentNotes: string | null,
  newNote: string,
) {
  return [currentNotes, newNote]
    .filter(Boolean)
    .join("\n");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export async function markPaymentAsPaid(
  paymentId: string,
  formData: FormData,
) {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },
  });

  if (!payment) {
    throw new Error(
      "El pago seleccionado no existe.",
    );
  }

  if (payment.status === "PAID") {
    redirect("/pagos?resultado=pagado");
  }

  if (
    payment.status === "CANCELLED" ||
    payment.status === "REFUNDED"
  ) {
    throw new Error(
      "No se puede registrar como pagado un cobro cancelado o reembolsado.",
    );
  }

  const paidAt = getPaymentDate(formData);
  const paymentMethod =
    getPaymentMethod(formData);

  const paidAmount = getPaymentAmount(
    formData,
    payment.amount,
  );

  const externalReference =
    getOptionalString(
      formData,
      "paymentReference",
    );

  const additionalNotes =
    getOptionalString(
      formData,
      "paymentNotes",
    );

  const isTest = getBoolean(
    formData,
    "isTest",
  );

  const createNextRenewal = getBoolean(
    formData,
    "createNextRenewal",
  );

  const paymentNotes = appendNote(
    payment.notes,
    [
      isTest
        ? "[PRUEBA] Registro utilizado para verificar el funcionamiento del portal."
        : "Pago real registrado en el portal.",
      `Fecha de pago: ${formatDate(paidAt)}.`,
      `Medio de pago: ${paymentMethod}.`,
      externalReference
        ? `Referencia bancaria o número de operación: ${externalReference}.`
        : null,
      additionalNotes
        ? `Observaciones: ${additionalNotes}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const outcome = await prisma.$transaction(
    async (transaction) => {
      await transaction.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "PAID",
          amount: paidAmount,
          paidAt,
          method: paymentMethod,
          notes: paymentNotes,
        },
      });

      /*
       * Un registro de prueba se marca como pagado,
       * pero no modifica la renovación, el proyecto
       * ni crea un vencimiento futuro.
       */
      if (isTest) {
        return {
          isTest: true,
          renewalProcessed: false,
          nextRenewalCreated: false,
          nextRenewalAlreadyExists: false,
          paidWithoutRenewing: false,
        };
      }

      if (
        !payment.reference?.startsWith(
          "renewal:",
        )
      ) {
        return {
          isTest: false,
          renewalProcessed: false,
          nextRenewalCreated: false,
          nextRenewalAlreadyExists: false,
          paidWithoutRenewing: false,
        };
      }

      const renewalId =
        payment.reference.replace(
          "renewal:",
          "",
        );

      const renewal =
        await transaction.renewal.findUnique({
          where: {
            id: renewalId,
          },
        });

      if (!renewal) {
        return {
          isTest: false,
          renewalProcessed: false,
          nextRenewalCreated: false,
          nextRenewalAlreadyExists: false,
          paidWithoutRenewing: false,
        };
      }

      /*
       * Permite registrar el pago sin avanzar
       * automáticamente un año.
       */
      if (!createNextRenewal) {
        await transaction.renewal.update({
          where: {
            id: renewal.id,
          },
          data: {
            status: "PAID",
            renewedAt: paidAt,
            notes: appendNote(
              renewal.notes,
              [
                `Pago registrado el ${formatDate(
                  paidAt,
                )}.`,
                "No se creó automáticamente la siguiente renovación.",
              ].join("\n"),
            ),
          },
        });

        return {
          isTest: false,
          renewalProcessed: true,
          nextRenewalCreated: false,
          nextRenewalAlreadyExists: false,
          paidWithoutRenewing: true,
        };
      }

      const nextDueDate = addOneYear(
        renewal.dueDate,
      );

      /*
       * Conserva la renovación anterior como
       * historial cerrado.
       */
      await transaction.renewal.update({
        where: {
          id: renewal.id,
        },
        data: {
          status: "RENEWED",
          renewedAt: paidAt,
          notes: appendNote(
            renewal.notes,
            [
              `Renovación pagada y cerrada el ${formatDate(
                paidAt,
              )}.`,
              `Próximo vencimiento calculado: ${formatDate(
                nextDueDate,
              )}.`,
            ].join("\n"),
          ),
        },
      });

      /*
       * Actualiza la fecha técnica almacenada
       * en el proyecto.
       */
      if (renewal.projectId) {
        if (renewal.type === "HOSTING") {
          await transaction.project.update({
            where: {
              id: renewal.projectId,
            },
            data: {
              hostingRenewalDate:
                nextDueDate,
            },
          });
        }

        if (renewal.type === "DOMAIN") {
          await transaction.project.update({
            where: {
              id: renewal.projectId,
            },
            data: {
              domainRenewalDate:
                nextDueDate,
            },
          });
        }
      }

      /*
       * Revisa si el próximo vencimiento ya fue
       * creado anteriormente.
       */
      const existingNextRenewal =
        await transaction.renewal.findFirst({
          where: {
            clientId: renewal.clientId,
            projectId: renewal.projectId,
            subscriptionId:
              renewal.subscriptionId,
            type: renewal.type,
            dueDate: nextDueDate,
          },
        });

      if (existingNextRenewal) {
        return {
          isTest: false,
          renewalProcessed: true,
          nextRenewalCreated: false,
          nextRenewalAlreadyExists: true,
          paidWithoutRenewing: false,
        };
      }

      await transaction.renewal.create({
        data: {
          clientId: renewal.clientId,
          projectId: renewal.projectId,
          subscriptionId:
            renewal.subscriptionId,
          type: renewal.type,
          description: renewal.description,
          dueDate: nextDueDate,
          amount:
            renewal.amount ?? paidAmount,
          status: "UPCOMING",
          notifiedAt: null,
          renewedAt: null,
          notes: [
            renewal.notes,
            `Renovación creada automáticamente desde el pago registrado el ${formatDate(
              paidAt,
            )}.`,
            `Renovación anterior: ${formatDate(
              renewal.dueDate,
            )}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });

      return {
        isTest: false,
        renewalProcessed: true,
        nextRenewalCreated: true,
        nextRenewalAlreadyExists: false,
        paidWithoutRenewing: false,
      };
    },
  );

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/renovaciones");
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );
  revalidatePath(
    `/clientes/${payment.clientId}/editar`,
  );

  if (outcome.isTest) {
    redirect(
      "/pagos?resultado=pagado-prueba",
    );
  }

  if (outcome.nextRenewalCreated) {
    redirect(
      "/pagos?resultado=pagado-renovacion-creada",
    );
  }

  if (
    outcome.nextRenewalAlreadyExists
  ) {
    redirect(
      "/pagos?resultado=pagado-renovacion-existente",
    );
  }

  if (outcome.paidWithoutRenewing) {
    redirect(
      "/pagos?resultado=pagado-sin-renovar",
    );
  }

  redirect("/pagos?resultado=pagado");
}

export async function cancelPayment(
  paymentId: string,
) {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },
  });

  if (!payment) {
    throw new Error(
      "El cobro seleccionado no existe.",
    );
  }

  if (
    payment.status !== "PENDING" &&
    payment.status !== "OVERDUE"
  ) {
    throw new Error(
      "Solo se pueden cancelar cobros pendientes o vencidos.",
    );
  }

  await prisma.payment.update({
    where: {
      id: payment.id,
    },
    data: {
      status: "CANCELLED",
      notes: appendNote(
        payment.notes,
        `Cobro cancelado manualmente el ${formatDate(
          new Date(),
        )}.`,
      ),
    },
  });

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/renovaciones");
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );

  redirect("/pagos?resultado=cancelado");
}