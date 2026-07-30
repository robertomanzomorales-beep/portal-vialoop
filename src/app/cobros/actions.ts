"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createFlowPayment } from "@/lib/flow";
import { sendEmail } from "@/lib/mail";
import { buildManualChargeEmail } from "@/lib/manual-charge-email-template";
import { prisma } from "@/lib/prisma";

export type ChargeActionState = {
  ok: boolean;
  message: string;
};

const EMPTY_STATE: ChargeActionState = {
  ok: false,
  message: "",
};

function text(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, field: string) {
  return text(formData, field) || null;
}

function parseMoney(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Ingresa un monto mayor que cero.");
  }

  return Math.round(amount);
}

function parseOptionalDate(value: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("La fecha límite no es válida.");
  }

  const date = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha límite no es válida.");
  }

  return date;
}

function validEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("El correo del destinatario no es válido.");
  }

  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No fue posible completar la operación.";
}

function grossFromNet(netAmount: unknown) {
  const net = Math.round(Number(netAmount));
  return net + Math.round(net * 0.19);
}

function appUrl() {
  const value = process.env.FLOW_APP_URL?.trim().replace(/\/+$/, "");

  if (!value) {
    throw new Error("Falta configurar FLOW_APP_URL.");
  }

  return value;
}

function paymentsEmail() {
  return (
    process.env.PAYMENTS_SMTP_FROM_EMAIL?.trim() ||
    process.env.PAYMENTS_SMTP_USER?.trim() ||
    "pagos@vialoop.cl"
  );
}

function commerceOrder() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return `PVC-${Date.now()}-${suffix}`;
}

function flowSubject(value: string) {
  const subject = value.trim();
  return subject.length <= 120 ? subject : `${subject.slice(0, 117)}...`;
}

async function remainingForSale(saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      client: true,
      payments: {
        select: { amount: true },
      },
    },
  });

  if (!sale) {
    throw new Error("La venta seleccionada ya no existe.");
  }

  if (sale.status !== "ACTIVE") {
    throw new Error("No se pueden crear cobros para una venta anulada.");
  }

  const total = grossFromNet(sale.netAmount);
  const paid = sale.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  return {
    sale,
    total,
    paid,
    balance: Math.max(total - paid, 0),
  };
}

async function paymentUrlForCharge(chargeId: string) {
  const order = await prisma.saleFlowOrder.findFirst({
    where: {
      manualChargeId: chargeId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      paymentUrl: true,
    },
  });

  return order?.paymentUrl ?? null;
}

async function ensureFlowOrderForCharge(chargeId: string) {
  const charge = await prisma.manualCharge.findUnique({
    where: { id: chargeId },
    include: {
      flowOrders: {
        where: {
          status: "PENDING",
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!charge) {
    throw new Error("El cobro seleccionado ya no existe.");
  }

  if (charge.method !== "FLOW") {
    return null;
  }

  const reusableOrder = charge.flowOrders.find((order) =>
    Boolean(order.paymentUrl),
  );

  if (reusableOrder?.paymentUrl) {
    return reusableOrder.paymentUrl;
  }

  const orderReference = commerceOrder();
  const subject = flowSubject(charge.concept);
  const baseUrl = appUrl();
  const flow = await createFlowPayment({
    commerceOrder: orderReference,
    subject,
    amount: Number(charge.amount),
    email: charge.recipientEmail,
    urlConfirmation: `${baseUrl}/api/cobros/flow/confirmacion`,
    urlReturn: `${baseUrl}/api/cobros/flow/retorno`,
    optional: {
      source: "manual-sale-charge",
      manualChargeId: charge.id,
      saleId: charge.saleId,
    },
  });

  await prisma.saleFlowOrder.create({
    data: {
      manualChargeId: charge.id,
      commerceOrder: orderReference,
      flowOrder: flow.flowOrder,
      token: flow.token,
      paymentUrl: flow.url,
      status: "PENDING",
      amount: charge.amount,
      payerEmail: charge.recipientEmail,
      subject,
      rawResponse: {
        source: "manual-sale-charge",
        flowOrder: flow.flowOrder,
        token: flow.token,
        paymentUrl: flow.url,
      },
    },
  });

  return flow.url;
}

async function deliverCharge(chargeId: string) {
  const charge = await prisma.manualCharge.findUnique({
    where: { id: chargeId },
    include: {
      sale: {
        include: {
          client: true,
        },
      },
    },
  });

  if (!charge) {
    throw new Error("El cobro seleccionado ya no existe.");
  }

  if (charge.status === "PAID" || charge.status === "CANCELLED") {
    throw new Error("Este cobro ya no se encuentra abierto.");
  }

  const paymentUrl = await paymentUrlForCharge(charge.id);
  const email = buildManualChargeEmail({
    chargeNumber: charge.number,
    recipientName: charge.recipientName,
    clientName:
      charge.sale.client.tradeName || charge.sale.client.businessName,
    concept: charge.concept,
    amount: Number(charge.amount),
    dueDate: charge.dueDate,
    paymentUrl,
    message: charge.message,
  });

  await prisma.manualCharge.update({
    where: { id: charge.id },
    data: {
      emailStatus: "PENDING",
      sendAttempts: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });

  try {
    const result = await sendEmail({
      mailAccount: "payments",
      to: charge.recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromEmail: paymentsEmail(),
      fromName: "Pagos Vialoop",
      replyTo: paymentsEmail(),
    });

    await prisma.manualCharge.update({
      where: { id: charge.id },
      data: {
        status: "SENT",
        emailStatus: "SENT",
        sentAt: new Date(),
        messageId: result.messageId,
        lastError: null,
      },
    });
  } catch (error) {
    await prisma.manualCharge.update({
      where: { id: charge.id },
      data: {
        emailStatus: "FAILED",
        lastError: errorMessage(error).slice(0, 4000),
      },
    });

    throw error;
  }
}

export async function createAndSendManualCharge(
  _previousState: ChargeActionState = EMPTY_STATE,
  formData: FormData,
): Promise<ChargeActionState> {
  let chargeId: string | null = null;

  try {
    const saleId = text(formData, "saleId");
    const amount = parseMoney(text(formData, "amount"));
    const concept = text(formData, "concept");
    const recipientName = text(formData, "recipientName");
    const recipientEmail = validEmail(text(formData, "recipientEmail"));
    const dueDate = parseOptionalDate(text(formData, "dueDate"));
    const message = optionalText(formData, "message");
    const methodValue = text(formData, "method");
    const method =
      methodValue === "FLOW" ? ("FLOW" as const) : ("BANK_TRANSFER" as const);

    if (!saleId || !concept || !recipientName) {
      throw new Error(
        "Completa la venta, el concepto y los datos del destinatario.",
      );
    }

    const summary = await remainingForSale(saleId);

    if (summary.balance <= 0) {
      throw new Error("La venta seleccionada ya se encuentra pagada.");
    }

    if (amount > summary.balance) {
      throw new Error(
        `El cobro supera el saldo pendiente de $${summary.balance.toLocaleString(
          "es-CL",
        )}.`,
      );
    }

    const charge = await prisma.manualCharge.create({
      data: {
        saleId,
        recipientName,
        recipientEmail,
        concept,
        amount,
        dueDate,
        method,
        status: "PENDING",
        message,
      },
    });
    chargeId = charge.id;

    await ensureFlowOrderForCharge(charge.id);

    await deliverCharge(charge.id);

    await prisma.activityLog.create({
      data: {
        clientId: summary.sale.clientId,
        action: "MANUAL_SALE_CHARGE_SENT",
        entityType: "ManualCharge",
        entityId: charge.id,
        description: "Se creó y envió manualmente una solicitud de pago.",
        metadata: {
          saleId,
          amount,
          method,
          recipientEmail,
        },
      },
    });

    revalidatePath("/");
    revalidatePath("/ventas");
    revalidatePath("/cobros");

    return {
      ok: true,
      message: `Cobro N.º ${String(charge.number).padStart(
        4,
        "0",
      )} creado y enviado correctamente.`,
    };
  } catch (error) {
    if (chargeId) {
      await prisma.manualCharge
        .update({
          where: { id: chargeId },
          data: {
            status: "ERROR",
            lastError: errorMessage(error).slice(0, 4000),
          },
        })
        .catch(() => undefined);
    }

    revalidatePath("/cobros");

    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function resendManualCharge(
  chargeId: string,
  _previousState: ChargeActionState = EMPTY_STATE,
  _formData: FormData,
): Promise<ChargeActionState> {
  try {
    await ensureFlowOrderForCharge(chargeId);
    await deliverCharge(chargeId);
    revalidatePath("/cobros");

    return {
      ok: true,
      message: "Cobro reenviado correctamente.",
    };
  } catch (error) {
    revalidatePath("/cobros");

    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function markManualChargeAsPaid(
  chargeId: string,
  formData: FormData,
) {
  const reference = optionalText(formData, "reference");
  const paidAt = parseOptionalDate(text(formData, "paidAt")) || new Date();

  await prisma.$transaction(async (transaction) => {
    const charge = await transaction.manualCharge.findUnique({
      where: { id: chargeId },
      include: {
        payment: true,
        sale: true,
      },
    });

    if (!charge) {
      throw new Error("El cobro seleccionado ya no existe.");
    }

    if (charge.status === "CANCELLED" || charge.status === "REJECTED") {
      throw new Error("El cobro ya no se encuentra abierto.");
    }

    if (!charge.payment) {
      await transaction.salePayment.create({
        data: {
          saleId: charge.saleId,
          manualChargeId: charge.id,
          amount: charge.amount,
          paidAt,
          method: "BANK_TRANSFER",
          reference,
          notes: `Pago registrado desde el cobro manual N.º ${charge.number}.`,
        },
      });
    }

    await transaction.manualCharge.update({
      where: { id: charge.id },
      data: {
        status: "PAID",
      },
    });

    await transaction.activityLog.create({
      data: {
        clientId: charge.sale.clientId,
        action: "MANUAL_SALE_CHARGE_PAID",
        entityType: "ManualCharge",
        entityId: charge.id,
        description:
          "Se confirmó manualmente el pago por transferencia de un cobro.",
        metadata: {
          saleId: charge.saleId,
          amount: Number(charge.amount),
          reference,
        },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/cobros");
}

export async function cancelManualCharge(formData: FormData) {
  const chargeId = text(formData, "chargeId");

  if (!chargeId) {
    return;
  }

  await prisma.manualCharge.updateMany({
    where: {
      id: chargeId,
      status: {
        notIn: ["PAID", "CANCELLED"],
      },
    },
    data: {
      status: "CANCELLED",
    },
  });

  await prisma.saleFlowOrder.updateMany({
    where: {
      manualChargeId: chargeId,
      status: "PENDING",
    },
    data: {
      status: "CANCELLED",
    },
  });

  revalidatePath("/cobros");
}
