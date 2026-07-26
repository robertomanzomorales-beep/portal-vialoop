import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getFlowPaymentStatus,
  type FlowPaymentStatusResponse,
} from "@/lib/flow";

type BillingCycleValue =
  | "MONTHLY"
  | "SEMIANNUAL"
  | "ANNUAL";

type LocalFlowOrderStatus =
  | "PENDING"
  | "PAID"
  | "REJECTED"
  | "CANCELLED"
  | "ERROR";

type TransactionOperation<T> = (
  transaction: Prisma.TransactionClient,
) => Promise<T>;

export type FlowSynchronizationResult = {
  paymentId: string;
  flowOrder: number;
  commerceOrder: string;
  state:
    | "paid"
    | "pending"
    | "rejected"
    | "cancelled";
  alreadyProcessed: boolean;
};

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
    timeZone: "America/Santiago",
  }).format(date);
}

function addMonthsPreservingDay(
  date: Date,
  months: number,
) {
  const result = new Date(date);
  const originalDay = result.getDate();

  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  const lastDay = new Date(
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
      lastDay,
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

  if (billingCycle === "SEMIANNUAL") {
    return addMonthsPreservingDay(
      currentDueDate,
      6,
    );
  }

  return addMonthsPreservingDay(
    currentDueDate,
    12,
  );
}

function calculateTotalWithVat(
  netAmount: unknown,
) {
  const normalizedNetAmount = Math.round(
    Number(netAmount),
  );

  if (
    !Number.isFinite(normalizedNetAmount) ||
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
    netAmount: normalizedNetAmount,
    vatAmount,
    totalWithVat:
      normalizedNetAmount +
      vatAmount,
  };
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

function mapFlowStatus(
  status: 1 | 2 | 3 | 4,
): LocalFlowOrderStatus {
  const statuses: Record<
    1 | 2 | 3 | 4,
    LocalFlowOrderStatus
  > = {
    1: "PENDING",
    2: "PAID",
    3: "REJECTED",
    4: "CANCELLED",
  };

  return statuses[status];
}

function mapPublicState(
  status: 1 | 2 | 3 | 4,
): FlowSynchronizationResult["state"] {
  const states: Record<
    1 | 2 | 3 | 4,
    FlowSynchronizationResult["state"]
  > = {
    1: "pending",
    2: "paid",
    3: "rejected",
    4: "cancelled",
  };

  return states[status];
}

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  const serialized =
    JSON.stringify(value);

  if (
    serialized === undefined
  ) {
    return {};
  }

  return JSON.parse(
    serialized,
  ) as Prisma.InputJsonValue;
}

function isRetryableTransactionError(
  error: unknown,
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function runSerializableTransaction<T>(
  operation: TransactionOperation<T>,
): Promise<T> {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (transaction) =>
          operation(transaction),
        {
          isolationLevel:
            Prisma
              .TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      lastError = error;

      if (
        !isRetryableTransactionError(
          error,
        ) ||
        attempt === 3
      ) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(
    "No fue posible completar la transacción de Flow.",
  );
}

function getFlowPaidAt(
  flowStatus: FlowPaymentStatusResponse,
) {
  const flowDate =
    flowStatus.paymentData?.date;

  if (
    typeof flowDate === "string" &&
    flowDate.trim()
  ) {
    const parsedDate = new Date(
      flowDate,
    );

    if (
      !Number.isNaN(
        parsedDate.getTime(),
      )
    ) {
      return parsedDate;
    }
  }

  return new Date();
}

async function registerNonPaidStatus({
  localFlowOrderId,
  paymentId,
  clientId,
  flowStatus,
  previousStatus,
}: {
  localFlowOrderId: string;
  paymentId: string;
  clientId: string;
  flowStatus: FlowPaymentStatusResponse;
  previousStatus: string;
}) {
  const mappedStatus =
    mapFlowStatus(
      flowStatus.status,
    );

  await prisma.$transaction(
    async (transaction) => {
      await transaction.flowOrder.update({
        where: {
          id: localFlowOrderId,
        },
        data: {
          status: mappedStatus,
          rawResponse:
            toPrismaJson(
              flowStatus,
            ),
        },
      });

      if (
        previousStatus !==
        mappedStatus
      ) {
        await transaction.activityLog.create({
          data: {
            clientId,
            action:
              "FLOW_ORDER_STATUS_UPDATED",
            entityType:
              "FlowOrder",
            entityId:
              localFlowOrderId,
            description:
              `La orden Flow ${flowStatus.flowOrder} cambió al estado ${mappedStatus}.`,
            metadata:
              toPrismaJson({
                paymentId,
                flowOrder:
                  flowStatus.flowOrder,
                commerceOrder:
                  flowStatus.commerceOrder,
                flowStatus:
                  flowStatus.status,
                localStatus:
                  mappedStatus,
              }),
          },
        });
      }
    },
  );
}

export async function synchronizeFlowPayment(
  token: string,
): Promise<FlowSynchronizationResult> {
  const normalizedToken =
    token.trim();

  if (!normalizedToken) {
    throw new Error(
      "No se recibió el token de Flow.",
    );
  }

  const flowStatus =
    await getFlowPaymentStatus(
      normalizedToken,
    );

  const localFlowOrder =
    await prisma.flowOrder.findFirst({
      where: {
        OR: [
          {
            token:
              normalizedToken,
          },
          {
            flowOrder:
              flowStatus.flowOrder,
          },
          {
            commerceOrder:
              flowStatus.commerceOrder,
          },
        ],
      },
      include: {
        payment: true,
      },
    });

  if (!localFlowOrder) {
    throw new Error(
      `No se encontró la orden Flow ${flowStatus.flowOrder} en el portal.`,
    );
  }

  if (
    localFlowOrder.commerceOrder !==
    flowStatus.commerceOrder
  ) {
    throw new Error(
      "La orden de comercio informada por Flow no coincide con el registro local.",
    );
  }

  const flowAmount = Math.round(
    Number(
      flowStatus.amount,
    ),
  );

  const localOrderAmount =
    Math.round(
      Number(
        localFlowOrder.amount,
      ),
    );

  const paymentAmount =
    Math.round(
      Number(
        localFlowOrder.payment
          .amount,
      ),
    );

  if (
    flowAmount !==
      localOrderAmount ||
    flowAmount !==
      paymentAmount
  ) {
    await prisma.flowOrder.update({
      where: {
        id:
          localFlowOrder.id,
      },
      data: {
        status: "ERROR",
        rawResponse:
          toPrismaJson(
            flowStatus,
          ),
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId:
          localFlowOrder.payment
            .clientId,
        action:
          "FLOW_AMOUNT_MISMATCH",
        entityType:
          "FlowOrder",
        entityId:
          localFlowOrder.id,
        description:
          "El monto confirmado por Flow no coincide con el monto registrado en el portal.",
        metadata:
          toPrismaJson({
            paymentId:
              localFlowOrder.paymentId,
            flowOrder:
              flowStatus.flowOrder,
            flowAmount,
            localOrderAmount,
            paymentAmount,
          }),
      },
    });

    throw new Error(
      "El monto confirmado por Flow no coincide con el monto registrado en el portal.",
    );
  }

  if (
    flowStatus.status !== 2
  ) {
    await registerNonPaidStatus({
      localFlowOrderId:
        localFlowOrder.id,
      paymentId:
        localFlowOrder.paymentId,
      clientId:
        localFlowOrder.payment
          .clientId,
      flowStatus,
      previousStatus:
        localFlowOrder.status,
    });

    return {
      paymentId:
        localFlowOrder.paymentId,
      flowOrder:
        flowStatus.flowOrder,
      commerceOrder:
        flowStatus.commerceOrder,
      state:
        mapPublicState(
          flowStatus.status,
        ),
      alreadyProcessed:
        false,
    };
  }

  const paidAt =
    getFlowPaidAt(
      flowStatus,
    );

  const rawResponse =
    toPrismaJson(
      flowStatus,
    );

  const outcome =
    await runSerializableTransaction(
      async (transaction) => {
        const currentFlowOrder =
          await transaction.flowOrder.findUnique({
            where: {
              id:
                localFlowOrder.id,
            },
            include: {
              payment: true,
            },
          });

        if (
          !currentFlowOrder
        ) {
          throw new Error(
            "La orden Flow dejó de existir durante la confirmación.",
          );
        }

        const payment =
          currentFlowOrder.payment;

        if (
          payment.status ===
          "PAID"
        ) {
          await transaction.flowOrder.update({
            where: {
              id:
                currentFlowOrder.id,
            },
            data: {
              status: "PAID",
              paidAt:
                currentFlowOrder.paidAt ??
                paidAt,
              rawResponse,
            },
          });

          return {
            alreadyProcessed:
              true,
            subscriptionId:
              payment.subscriptionId,
          };
        }

        if (
          payment.status ===
            "CANCELLED" ||
          payment.status ===
            "REFUNDED"
        ) {
          throw new Error(
            "Flow confirmó el pago, pero el cobro local se encuentra cancelado o reembolsado.",
          );
        }

        const paymentNotes =
          appendNote(
            payment.notes,
            [
              "Pago confirmado automáticamente por Flow.",
              `Fecha de confirmación: ${formatDate(
                paidAt,
              )}.`,
              `Orden Flow: ${flowStatus.flowOrder}.`,
              `Orden de comercio: ${flowStatus.commerceOrder}.`,
              flowStatus.paymentData
                ?.media
                ? `Medio informado por Flow: ${flowStatus.paymentData.media}.`
                : null,
              flowStatus.payer
                ? `Pagador informado: ${flowStatus.payer}.`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );

        await transaction.payment.update({
          where: {
            id:
              payment.id,
          },
          data: {
            status: "PAID",
            amount:
              flowAmount,
            paidAt,
            method: "OTHER",
            notes:
              paymentNotes,
          },
        });

        let processedSubscriptionId =
          payment.subscriptionId;

        if (
          payment.reference?.startsWith(
            "renewal:",
          )
        ) {
          const renewalId =
            payment.reference.replace(
              "renewal:",
              "",
            );

          const renewal =
            await transaction.renewal.findUnique({
              where: {
                id:
                  renewalId,
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

          if (renewal) {
            const subscription =
              renewal.subscription;

            if (
              renewal.type ===
                "SUBSCRIPTION" &&
              !subscription
            ) {
              throw new Error(
                "La renovación corresponde a una suscripción, pero la suscripción asociada no existe.",
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

            await transaction.renewal.update({
              where: {
                id:
                  renewal.id,
              },
              data: {
                status: "RENEWED",
                renewedAt:
                  paidAt,
                notes:
                  appendNote(
                    renewal.notes,
                    [
                      `Renovación pagada automáticamente mediante Flow el ${formatDate(
                        paidAt,
                      )}.`,
                      `Orden Flow: ${flowStatus.flowOrder}.`,
                      `Próximo vencimiento calculado: ${formatDate(
                        nextDueDate,
                      )}.`,
                    ].join("\n"),
                  ),
              },
            });

            if (
              renewal.projectId &&
              renewal.type ===
                "HOSTING"
            ) {
              await transaction.project.update({
                where: {
                  id:
                    renewal.projectId,
                },
                data: {
                  hostingRenewalDate:
                    nextDueDate,
                },
              });
            }

            if (
              renewal.projectId &&
              renewal.type ===
                "DOMAIN"
            ) {
              await transaction.project.update({
                where: {
                  id:
                    renewal.projectId,
                },
                data: {
                  domainRenewalDate:
                    nextDueDate,
                },
              });
            }

            if (subscription) {
              processedSubscriptionId =
                subscription.id;

              await transaction.subscription.update({
                where: {
                  id:
                    subscription.id,
                },
                data: {
                  renewsAt:
                    nextDueDate,
                  requestsUsed:
                    0,
                },
              });

              await transaction.activityLog.create({
                data: {
                  clientId:
                    subscription.clientId,
                  projectId:
                    subscription.projectId,
                  action:
                    "SUBSCRIPTION_CYCLE_RENEWED_BY_FLOW",
                  entityType:
                    "Subscription",
                  entityId:
                    subscription.id,
                  description:
                    `La suscripción ${subscription.plan.name} fue renovada automáticamente mediante Flow.`,
                  metadata:
                    toPrismaJson({
                      paymentId:
                        payment.id,
                      flowOrder:
                        flowStatus.flowOrder,
                      renewalId:
                        renewal.id,
                      previousDueDate:
                        renewal.dueDate.toISOString(),
                      nextDueDate:
                        nextDueDate.toISOString(),
                      paidAt:
                        paidAt.toISOString(),
                      paidAmount:
                        flowAmount,
                    }),
                },
              });
            }

            const {
              start:
                nextDueDateStart,
              end:
                nextDueDateEnd,
            } = getDayBounds(
              nextDueDate,
            );

            const existingNextRenewal =
              await transaction.renewal.findFirst({
                where: {
                  clientId:
                    renewal.clientId,
                  projectId:
                    renewal.projectId,
                  subscriptionId:
                    renewal.subscriptionId,
                  type:
                    renewal.type,
                  dueDate: {
                    gte:
                      nextDueDateStart,
                    lte:
                      nextDueDateEnd,
                  },
                  status: {
                    not:
                      "CANCELLED",
                  },
                },
              });

            if (
              !existingNextRenewal
            ) {
              let nextAmount =
                Number(
                  renewal.amount ??
                    flowAmount,
                );

              let nextDescription =
                renewal.description;

              let nextNotes: string[];

              if (subscription) {
                const {
                  netAmount,
                  vatAmount,
                  totalWithVat,
                } =
                  calculateTotalWithVat(
                    subscription.agreedPrice,
                  );

                const projectReference =
                  subscription.project
                    ?.domain ??
                  subscription.project
                    ?.name ??
                  subscription.client
                    .businessName;

                nextAmount =
                  totalWithVat;

                nextDescription =
                  `Renovación de suscripción ${subscription.plan.name} · ${projectReference}`;

                nextNotes = [
                  `Renovación creada automáticamente desde el pago Flow confirmado el ${formatDate(
                    paidAt,
                  )}.`,
                  `Orden Flow: ${flowStatus.flowOrder}.`,
                  `Suscripción: ${subscription.id}.`,
                  `Plan: ${subscription.plan.name}.`,
                  `Ciclo: ${getBillingCycleLabel(
                    subscription.billingCycle as BillingCycleValue,
                  )}.`,
                  `Monto neto: ${netAmount}.`,
                  `IVA 19%: ${vatAmount}.`,
                  `Total con IVA: ${totalWithVat}.`,
                ];
              } else {
                nextNotes = [
                  `Renovación creada automáticamente desde el pago Flow confirmado el ${formatDate(
                    paidAt,
                  )}.`,
                  `Orden Flow: ${flowStatus.flowOrder}.`,
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
                    type:
                      renewal.type,
                    description:
                      nextDescription,
                    dueDate:
                      nextDueDate,
                    amount:
                      nextAmount,
                    status:
                      "UPCOMING",
                    notifiedAt:
                      null,
                    renewedAt:
                      null,
                    notes:
                      nextNotes.join(
                        "\n",
                      ),
                  },
                });

              await transaction.activityLog.create({
                data: {
                  clientId:
                    renewal.clientId,
                  projectId:
                    renewal.projectId,
                  action:
                    "NEXT_RENEWAL_CREATED_BY_FLOW",
                  entityType:
                    "Renewal",
                  entityId:
                    nextRenewal.id,
                  description:
                    "Se creó automáticamente la siguiente renovación después del pago Flow.",
                  metadata:
                    toPrismaJson({
                      paymentId:
                        payment.id,
                      previousRenewalId:
                        renewal.id,
                      nextRenewalId:
                        nextRenewal.id,
                      flowOrder:
                        flowStatus.flowOrder,
                      nextDueDate:
                        nextDueDate.toISOString(),
                      amount:
                        nextAmount,
                    }),
                },
              });
            }
          }
        }

        await transaction.flowOrder.update({
          where: {
            id:
              currentFlowOrder.id,
          },
          data: {
            status: "PAID",
            paidAt,
            rawResponse,
          },
        });

        await transaction.activityLog.create({
          data: {
            clientId:
              payment.clientId,
            action:
              "FLOW_PAYMENT_CONFIRMED",
            entityType:
              "Payment",
            entityId:
              payment.id,
            description:
              `Pago confirmado automáticamente por Flow. Orden ${flowStatus.flowOrder}.`,
            metadata:
              toPrismaJson({
                flowOrderId:
                  currentFlowOrder.id,
                flowOrder:
                  flowStatus.flowOrder,
                commerceOrder:
                  flowStatus.commerceOrder,
                amount:
                  flowAmount,
                payer:
                  flowStatus.payer,
                paidAt:
                  paidAt.toISOString(),
              }),
          },
        });

        return {
          alreadyProcessed:
            false,
          subscriptionId:
            processedSubscriptionId,
        };
      },
    );

  return {
    paymentId:
      localFlowOrder.paymentId,
    flowOrder:
      flowStatus.flowOrder,
    commerceOrder:
      flowStatus.commerceOrder,
    state: "paid",
    alreadyProcessed:
      outcome.alreadyProcessed,
  };
}