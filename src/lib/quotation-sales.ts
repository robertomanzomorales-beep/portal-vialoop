import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  parseQuotationMetadata,
  type QuotationMetadata,
} from "@/lib/quotation";

type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

type QuotationPaymentInput = {
  quotationId: string;
  paymentId: string;
  paidAt: Date;
  amount: number;
  method: PaymentMethodValue;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function quotationReference(quotationId: string) {
  return `[quotation:${quotationId}]`;
}

function appendNote(current: string | null, note: string) {
  return [current, note].filter(Boolean).join("\n");
}

function saleDate(quotation: QuotationMetadata) {
  const source = quotation.acceptedAt || quotation.issuedAt;
  const dateKey = source.slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? new Date(`${dateKey}T12:00:00.000Z`)
    : new Date();

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function serviceName(quotation: QuotationMetadata) {
  return (
    quotation.referenceName.trim() ||
    quotation.projectName.trim() ||
    quotation.items
      .map((item) => item.description.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ") ||
    `Servicios de ${quotation.number}`
  );
}

export async function ensureQuotationSale(
  transaction: Prisma.TransactionClient,
  quotationId: string,
  quotation: QuotationMetadata,
) {
  const directSale = quotation.saleId
    ? await transaction.sale.findUnique({
        where: { id: quotation.saleId },
      })
    : null;

  if (
    directSale?.status === "ACTIVE" &&
    directSale.clientId === quotation.clientId
  ) {
    return directSale;
  }

  const reference = quotationReference(quotationId);
  const linkedSale = await transaction.sale.findFirst({
    where: {
      clientId: quotation.clientId,
      status: "ACTIVE",
      notes: { contains: reference },
    },
    orderBy: { createdAt: "desc" },
  });

  if (linkedSale) {
    return linkedSale;
  }

  /*
   * Las cotizaciones aceptadas antes de incorporar el vínculo explícito
   * pueden tener una venta creada manualmente. Sólo reutilizamos una
   * coincidencia inequívoca para no duplicar ingresos ni unir operaciones
   * distintas por error.
   */
  const legacyCandidates = await transaction.sale.findMany({
    where: {
      clientId: quotation.clientId,
      status: "ACTIVE",
      saleDate: saleDate(quotation),
      netAmount: quotation.netAmount,
      service: serviceName(quotation),
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  if (legacyCandidates.length === 1) {
    return transaction.sale.update({
      where: { id: legacyCandidates[0].id },
      data: {
        notes: appendNote(
          legacyCandidates[0].notes,
          `Vinculada automáticamente con ${quotation.number}. Referencia de origen: ${reference}.`,
        ),
      },
    });
  }

  return transaction.sale.create({
    data: {
      clientId: quotation.clientId,
      service: serviceName(quotation),
      saleDate: saleDate(quotation),
      netAmount: quotation.netAmount,
      notes: [
        `Venta creada automáticamente desde ${quotation.number}.`,
        `Referencia de origen: ${reference}.`,
        "La aceptación comercial y sus pagos se administran desde este registro.",
      ].join("\n"),
    },
  });
}

export async function synchronizeQuotationPaymentToSale(
  transaction: Prisma.TransactionClient,
  input: QuotationPaymentInput,
) {
  const quotationLog = await transaction.activityLog.findFirst({
    where: {
      id: input.quotationId,
      entityType: "Quotation",
    },
  });
  const quotation = quotationLog
    ? parseQuotationMetadata(quotationLog.metadata)
    : null;

  if (!quotationLog || !quotation) {
    return { synchronized: false as const };
  }

  const sale = await ensureQuotationSale(
    transaction,
    quotationLog.id,
    quotation,
  );
  const paymentReference = `payment:${input.paymentId}`;
  const existingSalePayment = await transaction.salePayment.findFirst({
    where: {
      saleId: sale.id,
      reference: paymentReference,
    },
  });

  if (existingSalePayment) {
    await transaction.salePayment.update({
      where: { id: existingSalePayment.id },
      data: {
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
      },
    });
  } else {
    await transaction.salePayment.create({
      data: {
        saleId: sale.id,
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        reference: paymentReference,
        notes: `Pago sincronizado automáticamente desde el cobro de ${quotation.number}.`,
      },
    });
  }

  const paid = await transaction.salePayment.aggregate({
    where: { saleId: sale.id },
    _sum: { amount: true },
  });
  const totalPaid = Number(paid._sum.amount ?? 0);
  const fullyPaid = totalPaid >= quotation.totalAmount;
  const paidAt = input.paidAt.toISOString();

  await transaction.activityLog.update({
    where: { id: quotationLog.id },
    data: {
      action: fullyPaid ? "QUOTATION_PAID" : "QUOTATION_PARTIALLY_PAID",
      description: fullyPaid
        ? `${quotation.number} pagada y conciliada con la venta N.º ${sale.number}.`
        : `${quotation.number} recibió un abono y mantiene saldo pendiente en la venta N.º ${sale.number}.`,
      metadata: json({
        ...quotation,
        commercialStatus: fullyPaid ? "PAID" : "ACCEPTED",
        paymentStatus: fullyPaid ? "PAID" : "PENDING",
        paidAt: fullyPaid ? paidAt : quotation.paidAt,
        flowPaymentId: input.paymentId,
        saleId: sale.id,
      } satisfies QuotationMetadata),
    },
  });

  if (!existingSalePayment) {
    await transaction.activityLog.create({
      data: {
        clientId: quotation.clientId,
        action: fullyPaid
          ? "QUOTATION_SALE_PAID"
          : "QUOTATION_SALE_PARTIAL_PAYMENT",
        entityType: "Sale",
        entityId: sale.id,
        description: fullyPaid
          ? `La venta N.º ${sale.number} quedó pagada desde ${quotation.number}.`
          : `Se registró un abono en la venta N.º ${sale.number} desde ${quotation.number}.`,
        metadata: json({
          quotationId: quotationLog.id,
          quotationNumber: quotation.number,
          paymentId: input.paymentId,
          saleId: sale.id,
          amount: input.amount,
          totalPaid,
          quotationTotal: quotation.totalAmount,
          paidAt,
        }),
      },
    });
  }

  return {
    synchronized: true as const,
    saleId: sale.id,
    saleNumber: sale.number,
    fullyPaid,
    totalPaid,
  };
}
