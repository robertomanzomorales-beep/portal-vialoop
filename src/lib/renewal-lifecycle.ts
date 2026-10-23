import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type BillingCycleValue =
  | "MONTHLY"
  | "SEMIANNUAL"
  | "ANNUAL";

type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

type SettlementSource =
  | "paid-payment"
  | "advanced-service-date"
  | "manual";

type SettleRenewalInput = {
  renewalId: string;
  settledAt: Date;
  source: SettlementSource;
  paymentId?: string | null;
  nextDueDate?: Date | null;
  createNextRenewal?: boolean;
  userId?: string | null;
};

export type RenewalReconciliationResult = {
  reviewed: number;
  reconciled: number;
  nextRenewalsCreated: number;
  errors: number;
};

const openStatuses = [
  "UPCOMING",
  "NOTIFIED",
  "EXPIRED",
] as const;

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
    Math.min(originalDay, lastDay),
  );

  return result;
}

function getNextDueDate(
  dueDate: Date,
  billingCycle?: BillingCycleValue,
) {
  if (billingCycle === "MONTHLY") {
    return addMonthsPreservingDay(
      dueDate,
      1,
    );
  }

  if (billingCycle === "SEMIANNUAL") {
    return addMonthsPreservingDay(
      dueDate,
      6,
    );
  }

  return addMonthsPreservingDay(
    dueDate,
    12,
  );
}

function getDayBounds(date: Date) {
  const start = new Date(date);
  const end = new Date(date);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function sourceLabel(source: SettlementSource) {
  const labels: Record<SettlementSource, string> = {
    "paid-payment":
      "el cobro asociado ya figuraba pagado",
    "advanced-service-date":
      "la fecha vigente del servicio ya había avanzado",
    manual:
      "el pago y la renovación fueron confirmados manualmente",
  };

  return labels[source];
}

function getSubscriptionAmount<Fallback>(
  agreedPrice: unknown,
  fallback: Fallback,
): number | Fallback {
  const netAmount = Math.round(
    Number(agreedPrice),
  );

  if (
    Number.isFinite(netAmount) &&
    netAmount > 0
  ) {
    return (
      netAmount +
      Math.round(netAmount * 0.19)
    );
  }

  return fallback;
}

async function settleRenewalInTransaction(
  transaction: Prisma.TransactionClient,
  input: SettleRenewalInput,
) {
  const renewal =
    await transaction.renewal.findUnique({
      where: {
        id: input.renewalId,
      },
      include: {
        project: true,
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
      state: "missing" as const,
      nextRenewalCreated: false,
      clientId: null,
      subscriptionId: null,
    };
  }

  if (
    !openStatuses.includes(
      renewal.status as
        (typeof openStatuses)[number],
    )
  ) {
    return {
      state: "already-closed" as const,
      nextRenewalCreated: false,
      clientId: renewal.clientId,
      subscriptionId:
        renewal.subscriptionId,
    };
  }

  const billingCycle =
    renewal.subscription
      ?.billingCycle as
      | BillingCycleValue
      | undefined;
  const nextDueDate =
    input.nextDueDate ??
    getNextDueDate(
      renewal.dueDate,
      billingCycle,
    );
  const createNextCycle =
    input.createNextRenewal !== false;
  const reconciliationNote = [
    `Renovación cerrada el ${formatDate(
      input.settledAt,
    )}: ${sourceLabel(input.source)}.`,
    createNextCycle
      ? `Próximo vencimiento: ${formatDate(
          nextDueDate,
        )}.`
      : "El pago fue confirmado sin crear un nuevo ciclo.",
  ].join("\n");

  const closed =
    await transaction.renewal.updateMany({
      where: {
        id: renewal.id,
        status: {
          in: [...openStatuses],
        },
      },
      data: {
        status: createNextCycle
          ? "RENEWED"
          : "PAID",
        renewedAt: createNextCycle
          ? input.settledAt
          : null,
        notes: appendNote(
          renewal.notes,
          reconciliationNote,
        ),
      },
    });

  if (closed.count === 0) {
    return {
      state: "already-closed" as const,
      nextRenewalCreated: false,
      clientId: renewal.clientId,
      subscriptionId:
        renewal.subscriptionId,
    };
  }

  if (
    createNextCycle &&
    renewal.projectId &&
    renewal.type === "HOSTING"
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
    createNextCycle &&
    renewal.projectId &&
    renewal.type === "DOMAIN"
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

  if (
    createNextCycle &&
    renewal.subscription
  ) {
    await transaction.subscription.update({
      where: {
        id: renewal.subscription.id,
      },
      data: {
        renewsAt: nextDueDate,
        requestsUsed: 0,
      },
    });
  }

  let nextRenewalCreated = false;

  if (createNextCycle) {
    const { start, end } =
      getDayBounds(nextDueDate);
    const existingNextRenewal =
      await transaction.renewal.findFirst({
        where: {
          clientId: renewal.clientId,
          projectId: renewal.projectId,
          subscriptionId:
            renewal.subscriptionId,
          type: renewal.type,
          dueDate: {
            gte: start,
            lte: end,
          },
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
        },
      });

    if (!existingNextRenewal) {
      const subscription =
        renewal.subscription;
      const projectReference =
        subscription?.project?.domain ??
        subscription?.project?.name ??
        subscription?.client.businessName;
      const nextAmount = subscription
        ? getSubscriptionAmount(
            subscription.agreedPrice,
            renewal.amount,
          )
        : renewal.amount;
      const nextDescription = subscription
        ? `Renovación de suscripción ${subscription.plan.name} · ${projectReference}`
        : renewal.description;

      await transaction.renewal.create({
        data: {
          clientId: renewal.clientId,
          projectId: renewal.projectId,
          subscriptionId:
            renewal.subscriptionId,
          type: renewal.type,
          description: nextDescription,
          dueDate: nextDueDate,
          amount: nextAmount,
          status: "UPCOMING",
          notifiedAt: null,
          renewedAt: null,
          notes: [
            `Siguiente ciclo creado al reconciliar la renovación anterior el ${formatDate(
              input.settledAt,
            )}.`,
            `Origen: ${sourceLabel(
              input.source,
            )}.`,
            `Renovación anterior: ${renewal.id}.`,
          ].join("\n"),
        },
      });

      nextRenewalCreated = true;
    }
  }

  await transaction.activityLog.create({
    data: {
      userId: input.userId || undefined,
      clientId: renewal.clientId,
      projectId: renewal.projectId,
      action:
        input.source === "manual"
          ? "RENEWAL_CONFIRMED_MANUALLY"
          : "RENEWAL_RECONCILED",
      entityType: "Renewal",
      entityId: renewal.id,
      description:
        `Renovación regularizada porque ${sourceLabel(
          input.source,
        )}.`,
      metadata: {
        source: input.source,
        paymentId:
          input.paymentId ?? null,
        previousDueDate:
          renewal.dueDate.toISOString(),
        nextDueDate:
          createNextCycle
            ? nextDueDate.toISOString()
            : null,
        settledAt:
          input.settledAt.toISOString(),
        nextRenewalCreated,
      },
    },
  });

  return {
    state: "reconciled" as const,
    nextRenewalCreated,
    clientId: renewal.clientId,
    subscriptionId:
      renewal.subscriptionId,
  };
}

export async function settleRenewal(
  input: SettleRenewalInput,
) {
  return prisma.$transaction(
    (transaction) =>
      settleRenewalInTransaction(
        transaction,
        input,
      ),
  );
}

export async function confirmRenewalPayment({
  renewalId,
  paidAt,
  paymentMethod,
  createNextRenewal,
  userId,
}: {
  renewalId: string;
  paidAt: Date;
  paymentMethod: PaymentMethodValue;
  createNextRenewal: boolean;
  userId: string;
}) {
  return prisma.$transaction(
    async (transaction) => {
      const renewal =
        await transaction.renewal.findUnique({
          where: {
            id: renewalId,
          },
          select: {
            id: true,
            clientId: true,
            subscriptionId: true,
            description: true,
            amount: true,
            dueDate: true,
            status: true,
          },
        });

      if (!renewal) {
        throw new Error(
          "La renovación seleccionada no existe.",
        );
      }

      if (
        !openStatuses.includes(
          renewal.status as
            (typeof openStatuses)[number],
        )
      ) {
        return {
          state: "already-closed" as const,
          nextRenewalCreated: false,
          clientId: renewal.clientId,
          subscriptionId:
            renewal.subscriptionId,
        };
      }

      const reference =
        `renewal:${renewal.id}`;
      const paymentCandidates =
        await transaction.payment.findMany({
          where: {
            clientId: renewal.clientId,
            reference,
            status: {
              notIn: [
                "CANCELLED",
                "REFUNDED",
              ],
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        });
      let payment =
        paymentCandidates.find(
          (candidate) =>
            !candidate.notes?.includes(
              "[PRUEBA]",
            ),
        ) ?? null;

      if (
        payment &&
        payment.status !== "PAID"
      ) {
        payment =
          await transaction.payment.update({
            where: {
              id: payment.id,
            },
            data: {
              status: "PAID",
              paidAt,
              method: paymentMethod,
              notes: appendNote(
                payment.notes,
                `Pago confirmado al regularizar la renovación el ${formatDate(
                  paidAt,
                )}.`,
              ),
            },
          });
      }

      if (!payment && renewal.amount !== null) {
        payment =
          await transaction.payment.create({
            data: {
              clientId: renewal.clientId,
              subscriptionId:
                renewal.subscriptionId,
              description:
                renewal.description,
              amount: renewal.amount,
              dueDate: renewal.dueDate,
              paidAt,
              status: "PAID",
              method: paymentMethod,
              reference,
              notes:
                `Pago registrado al confirmar manualmente la renovación el ${formatDate(
                  paidAt,
                )}.`,
            },
          });
      }

      return settleRenewalInTransaction(
        transaction,
        {
          renewalId,
          settledAt: paidAt,
          source: "manual",
          paymentId: payment?.id,
          createNextRenewal,
          userId,
        },
      );
    },
  );
}

export async function reconcileRenewalRecords(): Promise<RenewalReconciliationResult> {
  const result: RenewalReconciliationResult = {
    reviewed: 0,
    reconciled: 0,
    nextRenewalsCreated: 0,
    errors: 0,
  };
  const remainingOpenRenewals =
    await prisma.renewal.findMany({
      where: {
        status: {
          in: [...openStatuses],
        },
      },
      include: {
        project: {
          select: {
            hostingRenewalDate: true,
            domainRenewalDate: true,
          },
        },
        subscription: {
          select: {
            renewsAt: true,
          },
        },
      },
    });

  if (remainingOpenRenewals.length === 0) {
    return result;
  }

  const linkedPayments =
    await prisma.payment.findMany({
      where: {
        reference: {
          in: remainingOpenRenewals.map(
            (renewal) =>
              `renewal:${renewal.id}`,
          ),
        },
        OR: [
          {
            status: "PAID",
          },
          {
            flowOrders: {
              some: {
                status: "PAID",
              },
            },
          },
        ],
      },
      include: {
        flowOrders: {
          where: {
            status: "PAID",
          },
          orderBy: {
            paidAt: "desc",
          },
          take: 1,
        },
      },
    });

  for (const payment of linkedPayments) {
    if (
      payment.notes?.includes("[PRUEBA]") ||
      !payment.reference
    ) {
      continue;
    }

    const renewalId =
      payment.reference.replace(
        "renewal:",
        "",
      );

    if (!renewalId) {
      continue;
    }

    result.reviewed += 1;

    try {
      const paidFlowOrder =
        payment.flowOrders[0];
      const settledAt =
        payment.paidAt ??
        paidFlowOrder?.paidAt ??
        payment.updatedAt;
      const outcome =
        await prisma.$transaction(
          async (transaction) => {
            if (
              payment.status !== "PAID"
            ) {
              await transaction.payment.update({
                where: {
                  id: payment.id,
                },
                data: {
                  status: "PAID",
                  paidAt: settledAt,
                  method: "FLOW",
                  notes: appendNote(
                    payment.notes,
                    "Pago reconciliado desde una orden Flow confirmada.",
                  ),
                },
              });
            }

            return settleRenewalInTransaction(
              transaction,
              {
                renewalId,
                settledAt,
                source: "paid-payment",
                paymentId: payment.id,
                createNextRenewal: true,
              },
            );
          },
        );

      if (outcome.state === "reconciled") {
        result.reconciled += 1;
        if (outcome.nextRenewalCreated) {
          result.nextRenewalsCreated += 1;
        }
      }
    } catch (error) {
      result.errors += 1;
      console.error(
        `No fue posible reconciliar la renovación ${renewalId} con su pago:`,
        error,
      );
    }
  }

  for (const renewal of remainingOpenRenewals) {
    let authoritativeNextDate:
      | Date
      | null = null;

    if (renewal.type === "HOSTING") {
      authoritativeNextDate =
        renewal.project
          ?.hostingRenewalDate ?? null;
    } else if (renewal.type === "DOMAIN") {
      authoritativeNextDate =
        renewal.project
          ?.domainRenewalDate ?? null;
    } else if (renewal.type === "SUBSCRIPTION") {
      authoritativeNextDate =
        renewal.subscription
          ?.renewsAt ?? null;
    }

    if (
      !authoritativeNextDate ||
      authoritativeNextDate.getTime() <=
        renewal.dueDate.getTime()
    ) {
      continue;
    }

    result.reviewed += 1;

    try {
      const outcome = await settleRenewal({
        renewalId: renewal.id,
        settledAt: new Date(),
        source:
          "advanced-service-date",
        nextDueDate:
          authoritativeNextDate,
        createNextRenewal: true,
      });

      if (outcome.state === "reconciled") {
        result.reconciled += 1;
        if (outcome.nextRenewalCreated) {
          result.nextRenewalsCreated += 1;
        }
      }
    } catch (error) {
      result.errors += 1;
      console.error(
        `No fue posible reconciliar la fecha vigente de la renovación ${renewal.id}:`,
        error,
      );
    }
  }

  return result;
}
