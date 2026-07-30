import { Prisma } from "@/generated/prisma/client";
import {
  getFlowPaymentStatus,
  type FlowPaymentStatusResponse,
} from "@/lib/flow";
import { prisma } from "@/lib/prisma";

export type SaleFlowSynchronizationResult = {
  manualChargeId: string;
  salePaymentId: string | null;
  flowOrder: number;
  commerceOrder: string;
  state: "paid" | "pending" | "rejected" | "cancelled";
  alreadyProcessed: boolean;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function publicState(status: 1 | 2 | 3 | 4) {
  const states = {
    1: "pending",
    2: "paid",
    3: "rejected",
    4: "cancelled",
  } as const;

  return states[status];
}

function orderStatus(status: 1 | 2 | 3 | 4) {
  const statuses = {
    1: "PENDING",
    2: "PAID",
    3: "REJECTED",
    4: "CANCELLED",
  } as const;

  return statuses[status];
}

function paidDate(flowStatus: FlowPaymentStatusResponse) {
  const raw =
    typeof flowStatus.paymentData?.date === "string"
      ? flowStatus.paymentData.date
      : null;
  const parsed = raw ? new Date(raw) : new Date();

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isRetryable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

async function paidTransaction(
  localOrderId: string,
  flowStatus: FlowPaymentStatusResponse,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const currentOrder = await transaction.saleFlowOrder.findUnique({
            where: { id: localOrderId },
            include: {
              manualCharge: {
                include: {
                  payment: true,
                  sale: true,
                },
              },
            },
          });

          if (!currentOrder) {
            throw new Error("La orden de cobro ya no existe.");
          }

          const charge = currentOrder.manualCharge;

          if (
            currentOrder.status === "PAID" &&
            charge.status === "PAID" &&
            charge.payment
          ) {
            return {
              salePaymentId: charge.payment.id,
              alreadyProcessed: true,
            };
          }

          const paidAt = paidDate(flowStatus);
          const existingPayment = charge.payment;
          const payment =
            existingPayment ??
            (await transaction.salePayment.create({
              data: {
                saleId: charge.saleId,
                manualChargeId: charge.id,
                amount: charge.amount,
                paidAt,
                method: "FLOW",
                reference: String(flowStatus.flowOrder),
                notes: `Pago confirmado automáticamente por Flow para el cobro manual N.º ${charge.number}.`,
              },
            }));

          await transaction.saleFlowOrder.update({
            where: { id: currentOrder.id },
            data: {
              status: "PAID",
              paidAt,
              rawResponse: json(flowStatus),
            },
          });

          await transaction.manualCharge.update({
            where: { id: charge.id },
            data: {
              status: "PAID",
            },
          });

          await transaction.activityLog.create({
            data: {
              clientId: charge.sale.clientId,
              action: "MANUAL_SALE_CHARGE_PAID_BY_FLOW",
              entityType: "ManualCharge",
              entityId: charge.id,
              description:
                "Flow confirmó automáticamente el pago de un cobro manual asociado a una venta.",
              metadata: json({
                saleId: charge.saleId,
                salePaymentId: payment.id,
                flowOrder: flowStatus.flowOrder,
                commerceOrder: flowStatus.commerceOrder,
                amount: flowStatus.amount,
                payer: flowStatus.payer,
              }),
            },
          });

          return {
            salePaymentId: payment.id,
            alreadyProcessed: Boolean(existingPayment),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (attempt < 2 && isRetryable(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("No fue posible confirmar el pago de Flow.");
}

export async function synchronizeSaleFlowPayment(
  token: string,
): Promise<SaleFlowSynchronizationResult> {
  const flowStatus = await getFlowPaymentStatus(token);
  const localOrder = await prisma.saleFlowOrder.findUnique({
    where: {
      commerceOrder: flowStatus.commerceOrder,
    },
    include: {
      manualCharge: {
        include: {
          payment: true,
        },
      },
    },
  });

  if (!localOrder) {
    throw new Error(
      `No existe un cobro manual para la orden ${flowStatus.commerceOrder}.`,
    );
  }

  if (
    localOrder.flowOrder !== null &&
    localOrder.flowOrder !== flowStatus.flowOrder
  ) {
    throw new Error("El número de orden informado por Flow no coincide.");
  }

  const localAmount = Math.round(Number(localOrder.amount));
  const flowAmount = Math.round(Number(flowStatus.amount));

  if (localAmount !== flowAmount) {
    await prisma.saleFlowOrder.update({
      where: { id: localOrder.id },
      data: {
        status: "ERROR",
        rawResponse: json(flowStatus),
      },
    });

    await prisma.manualCharge.update({
      where: { id: localOrder.manualChargeId },
      data: {
        status: "ERROR",
        lastError: "El monto confirmado por Flow no coincide con el cobro.",
      },
    });

    throw new Error("El monto informado por Flow no coincide con el cobro.");
  }

  if (flowStatus.status !== 2) {
    const state = publicState(flowStatus.status);
    const status = orderStatus(flowStatus.status);

    await prisma.$transaction([
      prisma.saleFlowOrder.update({
        where: { id: localOrder.id },
        data: {
          flowOrder: flowStatus.flowOrder,
          token,
          status,
          rawResponse: json(flowStatus),
        },
      }),
      prisma.manualCharge.update({
        where: { id: localOrder.manualChargeId },
        data: {
          status:
            flowStatus.status === 1
              ? localOrder.manualCharge.status === "SENT"
                ? "SENT"
                : "PENDING"
              : flowStatus.status === 3
                ? "REJECTED"
                : "CANCELLED",
        },
      }),
    ]);

    return {
      manualChargeId: localOrder.manualChargeId,
      salePaymentId: localOrder.manualCharge.payment?.id ?? null,
      flowOrder: flowStatus.flowOrder,
      commerceOrder: flowStatus.commerceOrder,
      state,
      alreadyProcessed: false,
    };
  }

  const result = await paidTransaction(localOrder.id, flowStatus);

  return {
    manualChargeId: localOrder.manualChargeId,
    salePaymentId: result.salePaymentId,
    flowOrder: flowStatus.flowOrder,
    commerceOrder: flowStatus.commerceOrder,
    state: "paid",
    alreadyProcessed: result.alreadyProcessed,
  };
}
