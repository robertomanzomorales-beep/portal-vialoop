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

type BillingCycleValue =
  | "MONTHLY"
  | "SEMIANNUAL"
  | "ANNUAL";

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

function getPaymentMethodLabel(
  method: PaymentMethodValue,
) {
  const labels: Record<
    PaymentMethodValue,
    string
  > = {
    BANK_TRANSFER: "Transferencia bancaria",
    CREDIT_CARD: "Tarjeta de crédito",
    DEBIT_CARD: "Tarjeta de débito",
    CASH: "Efectivo",
    OTHER: "Otro medio",
  };

  return labels[method];
}

function getPaymentDate(
  formData: FormData,
) {
  const value = getOptionalString(
    formData,
    "paidAt",
  );

  if (!value) {
    return new Date();
  }

  const date = new Date(
    `${value}T12:00:00`,
  );

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
    const currentValue =
      Number(currentAmount);

    if (
      !Number.isFinite(currentValue) ||
      currentValue <= 0
    ) {
      throw new Error(
        "El cobro no tiene un monto válido.",
      );
    }

    return Math.round(currentValue);
  }

  /*
   * Los montos del portal se administran
   * como pesos chilenos sin decimales.
   *
   * Ejemplos válidos:
   * 69900
   * 69.900
   * $69.900
   */
  const normalizedValue =
    value.replace(/[^\d]/g, "");

  const amount = Number(
    normalizedValue,
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "El monto recibido debe ser mayor que cero.",
    );
  }

  return Math.round(amount);
}

function addMonthsPreservingDay(
  date: Date,
  months: number,
) {
  const result = new Date(date);
  const originalDay = result.getDate();

  /*
   * Se posiciona temporalmente en el primer
   * día del mes para evitar saltos como:
   * 31 de enero + 1 mes = marzo.
   */
  result.setDate(1);

  result.setMonth(
    result.getMonth() + months,
  );

  const lastDayOfTargetMonth =
    new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
      12,
      0,
      0,
      0,
    ).getDate();

  result.setDate(
    Math.min(
      originalDay,
      lastDayOfTargetMonth,
    ),
  );

  return result;
}

function getNextDueDate(
  currentDueDate: Date,
  billingCycle?: BillingCycleValue,
) {
  if (billingCycle === "MONTHLY") {
    return addMonthsPreservingDay(
      currentDueDate,
      1,
    );
  }

  if (
    billingCycle === "SEMIANNUAL"
  ) {
    return addMonthsPreservingDay(
      currentDueDate,
      6,
    );
  }

  /*
   * Suscripciones anuales, hosting,
   * dominios y otros servicios anuales.
   */
  return addMonthsPreservingDay(
    currentDueDate,
    12,
  );
}

function getBillingCycleLabel(
  billingCycle: BillingCycleValue,
) {
  const labels: Record<
    BillingCycleValue,
    string
  > = {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  return labels[billingCycle];
}

function calculateTotalWithVat(
  netAmount: unknown,
) {
  const normalizedNetAmount =
    Math.round(Number(netAmount));

  if (
    !Number.isFinite(
      normalizedNetAmount,
    ) ||
    normalizedNetAmount <= 0
  ) {
    throw new Error(
      "El precio acordado de la suscripción no es válido.",
    );
  }

  const vatAmount = Math.round(
    normalizedNetAmount * 0.19,
  );

  return {
    netAmount:
      normalizedNetAmount,
    vatAmount,
    totalWithVat:
      normalizedNetAmount +
      vatAmount,
  };
}

function getDayBounds(date: Date) {
  const start = new Date(date);
  const end = new Date(date);

  start.setHours(0, 0, 0, 0);
  end.setHours(
    23,
    59,
    59,
    999,
  );

  return {
    start,
    end,
  };
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

function formatDate(date: Date) {
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

export async function markPaymentAsPaid(
  paymentId: string,
  formData: FormData,
) {
  const payment =
    await prisma.payment.findUnique({
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
    redirect(
      "/pagos?resultado=pagado",
    );
  }

  if (
    payment.status === "CANCELLED" ||
    payment.status === "REFUNDED"
  ) {
    throw new Error(
      "No se puede registrar como pagado un cobro cancelado o reembolsado.",
    );
  }

  const paidAt =
    getPaymentDate(formData);

  const paymentMethod =
    getPaymentMethod(formData);

  const paidAmount =
    getPaymentAmount(
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

  const createNextRenewal =
    getBoolean(
      formData,
      "createNextRenewal",
    );

  const paymentNotes = appendNote(
    payment.notes,
    [
      isTest
        ? "[PRUEBA] Registro utilizado para verificar el funcionamiento del portal."
        : "Pago real registrado en el portal.",
      `Fecha de pago: ${formatDate(
        paidAt,
      )}.`,
      `Medio de pago: ${getPaymentMethodLabel(
        paymentMethod,
      )}.`,
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

  const outcome =
    await prisma.$transaction(
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
         * Un pago de prueba se registra como
         * pagado, pero no modifica renovaciones,
         * proyectos ni suscripciones.
         */
        if (isTest) {
          return {
            isTest: true,
            renewalProcessed: false,
            nextRenewalCreated: false,
            nextRenewalAlreadyExists: false,
            paidWithoutRenewing: false,
            subscriptionId: null,
          };
        }

        /*
         * Un pago independiente que no nació
         * desde una renovación se cierra sin
         * realizar otras acciones.
         */
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
            subscriptionId:
              payment.subscriptionId ??
              null,
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
            include: {
              subscription: {
                include: {
                  client: true,
                  project: true,
                  plan: true,
                },
              },
            },
          });

        if (!renewal) {
          return {
            isTest: false,
            renewalProcessed: false,
            nextRenewalCreated: false,
            nextRenewalAlreadyExists: false,
            paidWithoutRenewing: false,
            subscriptionId: null,
          };
        }

        const subscription =
          renewal.subscription;

        /*
         * Permite registrar el pago y cerrar la
         * renovación sin generar un nuevo ciclo.
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

          if (subscription) {
            await transaction.activityLog.create({
              data: {
                clientId:
                  subscription.clientId,
                projectId:
                  subscription.projectId,
                action:
                  "SUBSCRIPTION_PAYMENT_RECORDED",
                entityType:
                  "Subscription",
                entityId:
                  subscription.id,
                description:
                  "El pago fue registrado, pero no se creó el siguiente ciclo de renovación.",
                metadata: {
                  paymentId:
                    payment.id,
                  renewalId:
                    renewal.id,
                  paidAt:
                    paidAt.toISOString(),
                  paidAmount,
                  createNextRenewal:
                    false,
                },
              },
            });
          }

          return {
            isTest: false,
            renewalProcessed: true,
            nextRenewalCreated: false,
            nextRenewalAlreadyExists: false,
            paidWithoutRenewing: true,
            subscriptionId:
              subscription?.id ??
              null,
          };
        }

        if (
          renewal.type ===
            "SUBSCRIPTION" &&
          !subscription
        ) {
          throw new Error(
            "La renovación corresponde a una suscripción, pero el registro de la suscripción no existe.",
          );
        }

        const billingCycle =
          subscription
            ?.billingCycle as
            | BillingCycleValue
            | undefined;

        const nextDueDate =
          getNextDueDate(
            renewal.dueDate,
            billingCycle,
          );

        /*
         * La renovación anterior queda cerrada
         * como registro histórico.
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
         * Hosting y dominio continúan avanzando
         * anualmente como antes.
         */
        if (renewal.projectId) {
          if (
            renewal.type ===
            "HOSTING"
          ) {
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

          if (
            renewal.type ===
            "DOMAIN"
          ) {
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
         * Cuando corresponde a una suscripción:
         *
         * - avanza renewsAt según su ciclo;
         * - reinicia las solicitudes utilizadas;
         * - conserva el resto de sus datos.
         */
        if (subscription) {
          await transaction.subscription.update({
            where: {
              id: subscription.id,
            },
            data: {
              renewsAt: nextDueDate,
              requestsUsed: 0,
            },
          });

          await transaction.activityLog.create({
            data: {
              clientId:
                subscription.clientId,
              projectId:
                subscription.projectId,
              action:
                "SUBSCRIPTION_CYCLE_RENEWED",
              entityType:
                "Subscription",
              entityId:
                subscription.id,
              description: [
                `La suscripción ${subscription.plan.name} fue renovada.`,
                `Nuevo vencimiento: ${formatDate(
                  nextDueDate,
                )}.`,
                "Las solicitudes utilizadas fueron reiniciadas a cero.",
              ].join(" "),
              metadata: {
                paymentId:
                  payment.id,
                previousRenewalId:
                  renewal.id,
                billingCycle:
                  subscription.billingCycle,
                previousDueDate:
                  renewal.dueDate.toISOString(),
                nextDueDate:
                  nextDueDate.toISOString(),
                paidAt:
                  paidAt.toISOString(),
                paidAmount,
                previousRequestsUsed:
                  subscription.requestsUsed,
                currentRequestsUsed: 0,
              },
            },
          });
        }

        const {
          start: nextDueDateStart,
          end: nextDueDateEnd,
        } = getDayBounds(
          nextDueDate,
        );

        /*
         * Controla duplicados por servicio,
         * suscripción y día de vencimiento.
         */
        const existingNextRenewal =
          await transaction.renewal.findFirst({
            where: {
              clientId:
                renewal.clientId,
              projectId:
                renewal.projectId,
              subscriptionId:
                renewal.subscriptionId,
              type: renewal.type,
              dueDate: {
                gte: nextDueDateStart,
                lte: nextDueDateEnd,
              },
              status: {
                not: "CANCELLED",
              },
            },
          });

        if (existingNextRenewal) {
          return {
            isTest: false,
            renewalProcessed: true,
            nextRenewalCreated: false,
            nextRenewalAlreadyExists: true,
            paidWithoutRenewing: false,
            subscriptionId:
              subscription?.id ??
              null,
          };
        }

        let nextRenewalAmount =
          renewal.amount ??
          paidAmount;

        let nextRenewalDescription =
          renewal.description;

        let nextRenewalNotes: string[];

        if (subscription) {
          const {
            netAmount,
            vatAmount,
            totalWithVat,
          } = calculateTotalWithVat(
            subscription.agreedPrice,
          );

          const projectReference =
            subscription.project?.domain ??
            subscription.project?.name ??
            subscription.client.businessName;

          nextRenewalAmount =
            totalWithVat;

          nextRenewalDescription =
            `Renovación de suscripción ${subscription.plan.name} · ${projectReference}`;

          nextRenewalNotes = [
            `Renovación creada automáticamente desde el pago registrado el ${formatDate(
              paidAt,
            )}.`,
            `Suscripción: ${subscription.id}.`,
            `Plan: ${subscription.plan.name}.`,
            `Ciclo: ${getBillingCycleLabel(
              subscription.billingCycle as BillingCycleValue,
            )}.`,
            `Monto neto: ${netAmount}.`,
            `IVA 19%: ${vatAmount}.`,
            `Total con IVA: ${totalWithVat}.`,
            `Renovación anterior: ${formatDate(
              renewal.dueDate,
            )}.`,
          ];
        } else {
          nextRenewalNotes = [
            `Renovación creada automáticamente desde el pago registrado el ${formatDate(
              paidAt,
            )}.`,
            `Renovación anterior: ${formatDate(
              renewal.dueDate,
            )}.`,
          ];
        }

        const nextRenewal =
          await transaction.renewal.create({
            data: {
              clientId:
                renewal.clientId,
              projectId:
                renewal.projectId,
              subscriptionId:
                renewal.subscriptionId,
              type: renewal.type,
              description:
                nextRenewalDescription,
              dueDate: nextDueDate,
              amount:
                nextRenewalAmount,
              status: "UPCOMING",
              notifiedAt: null,
              renewedAt: null,
              notes:
                nextRenewalNotes.join(
                  "\n",
                ),
            },
          });

        if (subscription) {
          await transaction.activityLog.create({
            data: {
              clientId:
                subscription.clientId,
              projectId:
                subscription.projectId,
              action:
                "SUBSCRIPTION_NEXT_RENEWAL_CREATED",
              entityType: "Renewal",
              entityId:
                nextRenewal.id,
              description: `Se creó automáticamente la siguiente renovación de la suscripción ${subscription.plan.name}.`,
              metadata: {
                subscriptionId:
                  subscription.id,
                previousRenewalId:
                  renewal.id,
                nextRenewalId:
                  nextRenewal.id,
                nextDueDate:
                  nextDueDate.toISOString(),
                amount:
                  Number(
                    nextRenewalAmount,
                  ),
              },
            },
          });
        }

        return {
          isTest: false,
          renewalProcessed: true,
          nextRenewalCreated: true,
          nextRenewalAlreadyExists: false,
          paidWithoutRenewing: false,
          subscriptionId:
            subscription?.id ??
            null,
        };
      },
    );

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/renovaciones");
  revalidatePath("/suscripciones");
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );
  revalidatePath(
    `/clientes/${payment.clientId}/editar`,
  );

  if (outcome.subscriptionId) {
    revalidatePath(
      `/suscripciones/${outcome.subscriptionId}/editar`,
    );
  }

  if (outcome.isTest) {
    redirect(
      "/pagos?resultado=pagado-prueba",
    );
  }

  if (
    outcome.nextRenewalCreated
  ) {
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

  if (
    outcome.paidWithoutRenewing
  ) {
    redirect(
      "/pagos?resultado=pagado-sin-renovar",
    );
  }

  redirect(
    "/pagos?resultado=pagado",
  );
}

export async function cancelPayment(
  paymentId: string,
) {
  const payment =
    await prisma.payment.findUnique({
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
  revalidatePath("/suscripciones");
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );

  if (payment.subscriptionId) {
    revalidatePath(
      `/suscripciones/${payment.subscriptionId}/editar`,
    );
  }

  redirect(
    "/pagos?resultado=cancelado",
  );
}