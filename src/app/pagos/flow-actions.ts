"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  prisma,
} from "@/lib/prisma";

import {
  createFlowPayment,
} from "@/lib/flow";

function getRequiredAppUrl() {
  const value =
    process.env.FLOW_APP_URL
      ?.trim()
      .replace(/\/+$/, "");

  if (!value) {
    throw new Error(
      "Falta configurar FLOW_APP_URL.",
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

function createCommerceOrder(
  paymentId: string,
) {
  const timestamp =
    Date.now().toString();

  const normalizedPaymentId =
    paymentId
      .replace(
        /[^a-zA-Z0-9]/g,
        "",
      )
      .slice(-18);

  return `PV-${normalizedPaymentId}-${timestamp}`;
}

function normalizeSubject(
  description: string,
) {
  const value =
    description.trim();

  if (value.length <= 100) {
    return value;
  }

  return `${value.slice(
    0,
    97,
  )}...`;
}

export async function createFlowOrderForPayment(
  paymentId: string,
) {
  const payment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },

      include: {
        client: true,

        flowOrders: {
          where: {
            status:
              "PENDING",
          },

          orderBy: {
            createdAt:
              "desc",
          },

          take: 1,
        },
      },
    });

  if (!payment) {
    throw new Error(
      "El cobro seleccionado no existe.",
    );
  }

  if (
    payment.status !==
      "PENDING" &&
    payment.status !==
      "OVERDUE"
  ) {
    throw new Error(
      "Solo se puede generar un enlace Flow para cobros pendientes o vencidos.",
    );
  }

  const existingFlowOrder =
    payment.flowOrders[0];

  if (
    existingFlowOrder
      ?.paymentUrl
  ) {
    redirect(
      `/pagos?resultado=flow-existente&cobro=${payment.id}`,
    );
  }

  const payerEmail =
    payment.client.email
      ?.trim() ?? "";

  if (
    !isValidEmail(
      payerEmail,
    )
  ) {
    redirect(
      `/pagos?resultado=flow-sin-correo&cobro=${payment.id}`,
    );
  }

  const amount =
    Math.round(
      Number(
        payment.amount,
      ),
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    redirect(
      `/pagos?resultado=flow-sin-monto&cobro=${payment.id}`,
    );
  }

  const appUrl =
    getRequiredAppUrl();

  const commerceOrder =
    createCommerceOrder(
      payment.id,
    );

  const subject =
    normalizeSubject(
      payment.description,
    );

  let flowResult: Awaited<
    ReturnType<
      typeof createFlowPayment
    >
  >;

  try {
    flowResult =
      await createFlowPayment({
        commerceOrder,

        subject,

        amount,

        email:
          payerEmail,

        urlConfirmation:
          `${appUrl}/api/flow/confirmacion`,

        urlReturn:
          `${appUrl}/api/flow/retorno`,

        optional: {
          paymentId:
            payment.id,

          clientId:
            payment.clientId,

          reference:
            payment.reference,

          source:
            "portal-vialoop",
        },
      });
  } catch (error) {
    console.error(
      "No fue posible crear la orden Flow:",
      error,
    );

    await prisma.activityLog.create({
      data: {
        clientId:
          payment.clientId,

        action:
          "FLOW_ORDER_CREATE_ERROR",

        entityType:
          "Payment",

        entityId:
          payment.id,

        description:
          "No fue posible crear la orden de pago en Flow.",

        metadata: {
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido.",
        },
      },
    });

    redirect(
      `/pagos?resultado=flow-error&cobro=${payment.id}`,
    );
  }

  const flowOrder =
    await prisma.flowOrder.create({
      data: {
        paymentId:
          payment.id,

        commerceOrder,

        flowOrder:
          flowResult.flowOrder,

        token:
          flowResult.token,

        paymentUrl:
          flowResult.url,

        status:
          "PENDING",

        amount,

        payerEmail,

        subject,

        rawResponse: {
          flowOrder:
            flowResult.flowOrder,

          token:
            flowResult.token,

          paymentUrl:
            flowResult.url,
        },
      },
    });

  await prisma.activityLog.create({
    data: {
      clientId:
        payment.clientId,

      action:
        "FLOW_ORDER_CREATED",

      entityType:
        "FlowOrder",

      entityId:
        flowOrder.id,

      description:
        `Orden Flow ${flowResult.flowOrder} creada para el cobro ${payment.id}.`,

      metadata: {
        paymentId:
          payment.id,

        commerceOrder,

        flowOrder:
          flowResult.flowOrder,

        payerEmail,

        amount,
      },
    },
  });

  revalidatePath(
    "/pagos",
  );

  revalidatePath(
    `/clientes/${payment.clientId}`,
  );

  redirect(
    `/pagos?resultado=flow-creado&cobro=${payment.id}`,
  );
}