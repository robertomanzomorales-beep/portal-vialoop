"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { createFlowPayment } from "@/lib/flow";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import {
  createQuotationPdf,
  parseQuotationMetadata,
  type QuotationItem,
  type QuotationMetadata,
} from "@/lib/quotation";
import { buildQuotationEmail } from "@/lib/quotation-email";
import { registerQuotationInFollowUp } from "@/lib/quotation-follow-up";
import {
  ensureQuotationSale,
  synchronizeQuotationPaymentToSale,
} from "@/lib/quotation-sales";
import {
  parseProspectMetadata,
  type ProspectMetadata,
} from "@/lib/prospect";

export type QuotationActionState = {
  ok: boolean;
  message: string;
  quotationId?: string;
};

export type DeleteQuotationResult = {
  ok: boolean;
  message: string;
};

export type AcceptQuotationResult = {
  ok: boolean;
  message: string;
};

function json(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function text(
  formData: FormData,
  field: string,
) {
  const value = formData.get(field);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseItems(
  rawItems: string,
): QuotationItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawItems);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null,
    )
    .map((item) => ({
      description:
        typeof item.description === "string"
          ? item.description.trim()
          : "",
      detail:
        typeof item.detail === "string"
          ? item.detail.trim()
          : "",
      quantity:
        Math.max(
          1,
          Math.round(
            Number(item.quantity),
          ),
        ),
      unitPrice:
        Math.max(
          0,
          Math.round(
            Number(item.unitPrice),
          ),
        ),
    }))
    .filter(
      (item) =>
        item.description.length > 0 &&
        item.unitPrice > 0,
    )
    .slice(0, 50);
}

function addDays(
  date: Date,
  days: number,
) {
  const result = new Date(date);
  result.setUTCDate(
    result.getUTCDate() + days,
  );
  return result;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chileDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function getSender(value: string) {
  if (value === "roberto") {
    return {
      name: "Roberto Manzo M.",
      email: "rmanzo@vialoop.cl",
      role: "Ingeniero de Proyectos Digitales · Diseño web · Sistemas · Hosting",
    };
  }

  return {
    name: "Doris Loayza G.",
    email: "dloayza@vialoop.cl",
    role: "Ventas y Gestión Web & Hosting",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No fue posible enviar la cotización.";
}

function appendNote(
  current: string | null,
  note: string,
) {
  return [current, note]
    .filter(Boolean)
    .join("\n");
}

function quotationPaidAt(
  quotation: QuotationMetadata,
) {
  const source =
    quotation.paidAt ||
    quotation.acceptedAt;

  if (source) {
    const parsed = new Date(source);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function flowAppUrl() {
  const value = process.env.FLOW_APP_URL?.trim().replace(/\/+$/, "");

  if (!value) {
    throw new Error("Falta configurar FLOW_APP_URL para habilitar pagos Flow.");
  }

  return value;
}

function flowCommerceOrder(quotationId: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const quotationReference = quotationId.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  return `PVQ-${quotationReference}-${Date.now()}-${suffix}`;
}

async function createQuotationFlowPayment({
  quotationId,
  quotationNumber,
  clientId,
  recipientEmail,
  amount,
  dueDate,
  previousPaymentId,
}: {
  quotationId: string;
  quotationNumber: string;
  clientId: string;
  recipientEmail: string;
  amount: number;
  dueDate: string;
  previousPaymentId?: string;
}) {
  const payment = await prisma.payment.create({
    data: {
      clientId,
      description: `Pago de cotización ${quotationNumber}`,
      amount,
      dueDate: new Date(`${dueDate}T12:00:00.000Z`),
      status: "PENDING",
      method: "FLOW",
      reference: `quotation:${quotationId}`,
      notes: `Enlace Flow generado desde ${quotationNumber}.`,
    },
  });

  try {
    const commerceOrder = flowCommerceOrder(quotationId);
    const appUrl = flowAppUrl();
    const flow = await createFlowPayment({
      commerceOrder,
      subject: `Cotización ${quotationNumber}`,
      amount,
      email: recipientEmail,
      urlConfirmation: `${appUrl}/api/flow/confirmacion`,
      urlReturn: `${appUrl}/api/flow/retorno`,
      optional: {
        source: "quotation",
        quotationId,
        quotationNumber,
        paymentId: payment.id,
        clientId,
      },
    });

    await prisma.$transaction([
      prisma.flowOrder.create({
        data: {
          paymentId: payment.id,
          commerceOrder,
          flowOrder: flow.flowOrder,
          token: flow.token,
          paymentUrl: flow.url,
          status: "PENDING",
          amount,
          payerEmail: recipientEmail,
          subject: `Cotización ${quotationNumber}`,
          rawResponse: {
            source: "quotation",
            quotationId,
            quotationNumber,
            paymentUrl: flow.url,
          },
        },
      }),
      ...(previousPaymentId
        ? [
            prisma.payment.updateMany({
              where: {
                id: previousPaymentId,
                status: { in: ["PENDING", "OVERDUE"] },
              },
              data: {
                status: "CANCELLED",
                notes: `Enlace reemplazado por una nueva versión de ${quotationNumber}.`,
              },
            }),
          ]
        : []),
    ]);

    return {
      paymentId: payment.id,
      paymentUrl: flow.url,
    };
  } catch (error) {
    await prisma.payment.delete({ where: { id: payment.id } }).catch(() => undefined);
    throw error;
  }
}

export async function createAndSendQuotation(
  _previousState: QuotationActionState,
  formData: FormData,
): Promise<QuotationActionState> {
  const user = await requireUser();
  const editQuotationId = text(formData, "editQuotationId");
  const clientId = text(formData, "clientId");
  const recipientEmail = text(formData, "recipientEmail").toLowerCase();
  const contactName = text(formData, "contactName");
  const referenceName = text(formData, "referenceName");
  const projectName = text(formData, "projectName");
  const notes = text(formData, "notes");
  const items = parseItems(text(formData, "items"));
  const paymentOption =
    text(formData, "paymentOption") === "TRANSFER_FLOW"
      ? ("TRANSFER_FLOW" as const)
      : ("TRANSFER" as const);

  const validDays = Math.min(
    90,
    Math.max(
      1,
      Number(
        text(
          formData,
          "validDays",
        ),
      ) || 15,
    ),
  );

  if (
    !clientId ||
    !recipientEmail.includes("@") ||
    items.length === 0
  ) {
    return {
      ok: false,
      message:
        "Selecciona un cliente, indica un correo válido y agrega al menos un servicio con valor.",
    };
  }

  const [client, existingQuotationLog] = await Promise.all([
    prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        rut: true,
        mainContactName: true,
        phone: true,
      },
    }),
    editQuotationId
      ? prisma.activityLog.findFirst({
          where: {
            id: editQuotationId,
            entityType: "Quotation",
          },
        })
      : Promise.resolve(null),
  ]);

  if (!client) {
    return {
      ok: false,
      message:
        "El cliente seleccionado ya no existe.",
    };
  }

  const existingQuotation = existingQuotationLog
    ? parseQuotationMetadata(existingQuotationLog.metadata)
    : null;

  if (editQuotationId && (!existingQuotationLog || !existingQuotation)) {
    return {
      ok: false,
      message: "La cotización que intentas editar ya no existe.",
    };
  }

  if (
    existingQuotation &&
    (existingQuotation.commercialStatus === "ACCEPTED" ||
      existingQuotation.commercialStatus === "PAID")
  ) {
    return {
      ok: false,
      message:
        "Una cotización aceptada o pagada no se edita. Duplícala para emitir una nueva versión sin alterar el historial.",
    };
  }

  const netAmount = items.reduce(
    (total, item) =>
      total +
      item.quantity *
        item.unitPrice,
    0,
  );

  const taxAmount =
    Math.round(netAmount * 0.19);

  const totalAmount =
    netAmount + taxAmount;

  const now = new Date();
  const sender = getSender(
    text(formData, "sender"),
  );

  let number = existingQuotation?.number ?? "";

  if (!number) {
    const counter = await prisma.counter.upsert({
      where: { key: "quotation-number" },
      update: { nextValue: { increment: 1 } },
      create: { key: "quotation-number", nextValue: 2 },
      select: { nextValue: true },
    });
    number = `COT-${now.getUTCFullYear()}-${(counter.nextValue - 1)
      .toString()
      .padStart(4, "0")}`;
  }

  const metadata: QuotationMetadata = {
    ...existingQuotation,
    number,
    clientId,
    clientName:
      client.tradeName ||
      client.businessName,
    clientTaxId:
      client.rut || undefined,
    contactName,
    recipientEmail,
    referenceName: referenceName || projectName || "Propuesta comercial",
    projectName,
    items,
    netAmount,
    taxAmount,
    totalAmount,
    issuedAt: dateKey(now),
    validUntil: dateKey(
      addDays(now, validDays),
    ),
    notes:
      notes ||
      "Valores expresados en pesos chilenos. La propuesta considera los servicios indicados y tiene la vigencia señalada.",
    senderName: sender.name,
    senderEmail: sender.email,
    senderRole: sender.role,
    paymentOption,
    commercialStatus: "DRAFT",
    paymentStatus: "NOT_CREATED",
    acceptedAt: undefined,
    acceptedBy: undefined,
    paidAt: undefined,
    saleId: undefined,
    flowPaymentId: undefined,
    flowPaymentUrl: undefined,
    emailStatus: "PENDING",
    messageId: undefined,
    lastError: undefined,
    expiryNotificationSentAt: undefined,
    expiryNotificationMessageId: undefined,
    expiryNotificationLastAttemptAt: undefined,
    expiryNotificationLastError: undefined,
  };

  const quotationLog = existingQuotationLog
    ? await prisma.activityLog.update({
        where: { id: existingQuotationLog.id },
        data: {
          userId: user.id,
          clientId,
          action: "QUOTATION_UPDATED",
          entityId: number,
          description: `${number} actualizada para ${metadata.clientName}.`,
          metadata: json(metadata),
        },
      })
    : await prisma.activityLog.create({
        data: {
          userId: user.id,
          clientId,
          action: "QUOTATION_CREATED",
          entityType: "Quotation",
          entityId: number,
          description: `${number} preparada para ${metadata.clientName}.`,
          metadata: json(metadata),
        },
      });

  if (existingQuotation?.flowPaymentId) {
    await prisma.payment.updateMany({
      where: {
        id: existingQuotation.flowPaymentId,
        status: { in: ["PENDING", "OVERDUE"] },
      },
      data: {
        status: "CANCELLED",
        notes: `Cobro reemplazado al reenviar ${number}. La aceptación debe registrarse nuevamente.`,
      },
    });
  }

  let messageId = "";

  try {
    const pdf =
      await createQuotationPdf(
        metadata,
      );

    const email = buildQuotationEmail(metadata);

    const result = await sendEmail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromEmail: sender.email,
      fromName: sender.name,
      replyTo: sender.email,
      mailAccount: "default",
      attachments: [
        {
          filename: `Cotizacion-${number}-Vialoop.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    messageId = result.messageId;
  } catch (error) {
    const message = errorMessage(error);

    await prisma.activityLog.update({
      where: {
        id: quotationLog.id,
      },
      data: {
        action: "QUOTATION_SEND_FAILED",
        description: `${number} quedó registrada, pero el correo no pudo enviarse.`,
        metadata: json({
          ...metadata,
          emailStatus: "FAILED",
          lastError: message,
        }),
      },
    });

    revalidatePath("/cotizaciones");

    return {
      ok: false,
      message: `La cotización quedó registrada, pero no se pudo enviar: ${message}`,
      quotationId: quotationLog.id,
    };
  }

  const sentMetadata: QuotationMetadata = {
    ...metadata,
    emailStatus: "SENT",
    commercialStatus: "SENT",
    messageId,
  };

  try {
    await prisma.activityLog.update({
      where: {
        id: quotationLog.id,
      },
      data: {
        action: "QUOTATION_SENT",
        description: `${number} enviada a ${recipientEmail}.`,
        metadata: json(sentMetadata),
      },
    });
  } catch (error) {
    console.error(
      `La cotización ${number} fue enviada, pero no se pudo actualizar su registro:`,
      error,
    );

    revalidatePath("/cotizaciones");

    return {
      ok: true,
      message: `${number} fue enviada a ${recipientEmail}, pero el registro interno quedó pendiente de actualización.`,
      quotationId: quotationLog.id,
    };
  }

  let followUpRegistered = false;

  try {
    const followUpId =
      await registerQuotationInFollowUp({
        quotationId: quotationLog.id,
        quotation: sentMetadata,
        userId: user.id,
        clientId,
        clientPhone: client.phone,
        clientContactName:
          client.mainContactName,
      });

    await prisma.activityLog.update({
      where: {
        id: quotationLog.id,
      },
      data: {
        metadata: json({
          ...sentMetadata,
          followUpId,
          followUpRegisteredAt:
            new Date().toISOString(),
        }),
      },
    });

    followUpRegistered = true;
  } catch (error) {
    console.error(
      `No fue posible registrar ${number} en seguimiento:`,
      error,
    );
  }

  revalidatePath("/");
  revalidatePath("/cotizaciones");
  revalidatePath("/seguimiento");
  revalidatePath("/pagos");
  revalidatePath(`/clientes/${clientId}`);

  return {
    ok: true,
    message: followUpRegistered
      ? `${number} ${existingQuotation ? "actualizada y reenviada" : "enviada"} a ${recipientEmail}, con registro en Seguimiento.`
      : `${number} enviada a ${recipientEmail}; revisa el registro manual en Seguimiento.`,
    quotationId: quotationLog.id,
  };
}

export async function acceptQuotation(
  quotationId: string,
): Promise<AcceptQuotationResult> {
  const user = await requireUser();
  const quotationLog = await prisma.activityLog.findFirst({
    where: {
      id: quotationId,
      entityType: "Quotation",
    },
  });
  const quotation = quotationLog
    ? parseQuotationMetadata(quotationLog.metadata)
    : null;

  if (!quotationLog || !quotation) {
    return {
      ok: false,
      message: "La cotización ya no existe o su registro no es válido.",
    };
  }

  const existingPayment = await prisma.payment.findFirst({
    where: {
      status: {
        in: ["PENDING", "OVERDUE", "PAID"],
      },
      OR: [
        { reference: `quotation:${quotationLog.id}` },
        ...(quotation.flowPaymentId
          ? [{ id: quotation.flowPaymentId }]
          : []),
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      flowOrders: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (
    quotation.commercialStatus === "PAID" ||
    existingPayment?.status === "PAID"
  ) {
    const reconciliation = await prisma.$transaction(async (transaction) => {
      const paidAt =
        existingPayment?.paidAt ??
        quotationPaidAt(quotation);
      let paidPayment: Pick<
        NonNullable<typeof existingPayment>,
        "id" | "paidAt" | "amount" | "method"
      > | null =
        existingPayment?.status === "PAID"
          ? existingPayment
          : null;

      if (
        !paidPayment &&
        quotation.commercialStatus === "PAID"
      ) {
        paidPayment =
          existingPayment &&
          (existingPayment.status === "PENDING" ||
            existingPayment.status === "OVERDUE")
            ? await transaction.payment.update({
                where: { id: existingPayment.id },
                data: {
                  status: "PAID",
                  paidAt,
                  method: existingPayment.method ?? "OTHER",
                  notes: appendNote(
                    existingPayment.notes,
                    `Pago histórico conciliado desde ${quotation.number}.`,
                  ),
                },
              })
            : await transaction.payment.create({
                data: {
                  clientId: quotation.clientId,
                  description: `Pago histórico de cotización ${quotation.number}`,
                  amount: quotation.totalAmount,
                  dueDate: new Date(
                    `${quotation.validUntil || chileDateKey()}T12:00:00.000Z`,
                  ),
                  paidAt,
                  status: "PAID",
                  method: "OTHER",
                  reference: `quotation:${quotationLog.id}`,
                  notes: `Cobro histórico creado al conciliar ${quotation.number} con Ventas.`,
                },
              });
      }

      if (paidPayment) {
        return synchronizeQuotationPaymentToSale(transaction, {
          quotationId: quotationLog.id,
          paymentId: paidPayment.id,
          paidAt: paidPayment.paidAt ?? paidAt,
          amount: Number(paidPayment.amount),
          method: paidPayment.method ?? "OTHER",
        });
      }

      return { synchronized: false as const };
    });

    revalidatePath("/");
    revalidatePath("/cotizaciones");
    revalidatePath("/ventas");
    revalidatePath(`/clientes/${quotation.clientId}`);

    return {
      ok: reconciliation.synchronized,
      message: reconciliation.synchronized
        ? `${quotation.number} está pagada y vinculada con su venta.`
        : `No fue posible conciliar ${quotation.number} con su venta.`,
    };
  }

  if (
    quotation.commercialStatus !== "SENT" &&
    quotation.commercialStatus !== "ACCEPTED"
  ) {
    return {
      ok: false,
      message:
        "Primero envía correctamente la cotización. Luego podrás aceptar la versión que recibió el cliente.",
    };
  }

  const today = chileDateKey();
  const dueDate =
    quotation.validUntil && quotation.validUntil >= today
      ? quotation.validUntil
      : today;
  let paymentId = existingPayment?.status === "PENDING" ||
      existingPayment?.status === "OVERDUE"
    ? existingPayment.id
    : "";
  let paymentUrl = existingPayment?.flowOrders[0]?.paymentUrl ?? "";

  if (!paymentId) {
    if (quotation.paymentOption === "TRANSFER_FLOW") {
      try {
        const flow = await createQuotationFlowPayment({
          quotationId: quotationLog.id,
          quotationNumber: quotation.number,
          clientId: quotation.clientId,
          recipientEmail: quotation.recipientEmail,
          amount: quotation.totalAmount,
          dueDate,
        });
        paymentId = flow.paymentId;
        paymentUrl = flow.paymentUrl;
      } catch (error) {
        return {
          ok: false,
          message: `No fue posible preparar el cobro Flow: ${errorMessage(error)}`,
        };
      }
    } else {
      const payment = await prisma.payment.create({
        data: {
          clientId: quotation.clientId,
          description: `Pago de cotización ${quotation.number}`,
          amount: quotation.totalAmount,
          dueDate: new Date(`${dueDate}T12:00:00.000Z`),
          status: "PENDING",
          method: "BANK_TRANSFER",
          reference: `quotation:${quotationLog.id}`,
          notes: `${quotation.number} aceptada; pago pendiente por transferencia.`,
        },
      });
      paymentId = payment.id;
    }
  }

  const newlyAccepted = quotation.commercialStatus !== "ACCEPTED";
  const acceptedAt = quotation.acceptedAt ?? new Date().toISOString();
  const candidates = await prisma.activityLog.findMany({
    where: {
      entityType: "Prospect",
      OR: [
        ...(quotation.followUpId ? [{ id: quotation.followUpId }] : []),
        { clientId: quotation.clientId },
        { entityId: quotation.recipientEmail },
        { entityId: quotation.clientName },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const linkedProspect = candidates
    .map((log) => ({
      log,
      metadata: parseProspectMetadata(log.metadata),
    }))
    .find(
      (candidate) =>
        candidate.metadata?.quotations.some(
          (item) =>
            item.id === quotationLog.id ||
            item.number === quotation.number,
        ),
    );
  const acceptedMetadata: QuotationMetadata = {
    ...quotation,
    commercialStatus: "ACCEPTED",
    paymentStatus: "PENDING",
    acceptedAt,
    acceptedBy: quotation.acceptedBy ?? user.name,
    flowPaymentId: paymentId,
    flowPaymentUrl: paymentUrl || undefined,
  };

  const acceptedSale = await prisma.$transaction(async (transaction) => {
    const sale = await ensureQuotationSale(
      transaction,
      quotationLog.id,
      acceptedMetadata,
    );
    const linkedMetadata: QuotationMetadata = {
      ...acceptedMetadata,
      saleId: sale.id,
    };

    await transaction.activityLog.update({
      where: { id: quotationLog.id },
      data: {
        userId: user.id,
        action: "QUOTATION_ACCEPTED",
        description: `${quotation.number} aceptada por ${user.name}; cobro pendiente.`,
        metadata: json(linkedMetadata),
      },
    });

    if (linkedProspect?.metadata && newlyAccepted) {
      const prospectMetadata: ProspectMetadata = {
        ...linkedProspect.metadata,
        status: "WON",
        lastContactAt: today,
        nextFollowUp: "",
        nextAction: `Cobro pendiente de ${quotation.number}`,
        updatedAt: acceptedAt,
        activities: [
          {
            id: randomUUID(),
            contactedAt: today,
            nextFollowUp: "",
            action: "Cotización aceptada",
            note: `${quotation.number} aceptada internamente. Se generó el cobro pendiente por ${quotation.totalAmount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}.`,
            responsible: user.name,
            createdAt: acceptedAt,
          },
          ...linkedProspect.metadata.activities,
        ].slice(0, 100),
      };

      await transaction.activityLog.update({
        where: { id: linkedProspect.log.id },
        data: {
          userId: user.id,
          action: "PROSPECT_QUOTATION_ACCEPTED",
          description: `${quotation.number} aceptada; la oportunidad quedó ganada y el cobro pendiente.`,
          metadata: json(prospectMetadata),
        },
      });
    }

    return sale;
  });

  revalidatePath("/");
  revalidatePath("/cotizaciones");
  revalidatePath("/seguimiento");
  revalidatePath("/pagos");
  revalidatePath("/ventas");
  revalidatePath(`/clientes/${quotation.clientId}`);

  return {
    ok: true,
    message: newlyAccepted
      ? `${quotation.number} quedó aceptada, registrada como venta N.º ${acceptedSale.number} y pendiente de pago.`
      : `${quotation.number} quedó vinculada con la venta N.º ${acceptedSale.number} y mantiene su cobro pendiente.`,
  };
}

function withoutQuotationNote(
  notes: string,
  quotationNumber: string,
) {
  return notes
    .split("\n")
    .filter(
      (line) =>
        !line.includes(quotationNumber),
    )
    .join("\n")
    .trim();
}

function removeQuotationFromProspect(
  metadata: ProspectMetadata,
  quotationId: string,
  quotationNumber: string,
  validUntil: string,
): ProspectMetadata {
  const quotations =
    metadata.quotations.filter(
      (quotation) =>
        quotation.id !== quotationId &&
        quotation.number !== quotationNumber,
    );
  const remainingDeadlines = quotations
    .map((quotation) => quotation.validUntil)
    .filter(Boolean)
    .sort();
  const nextFollowUp =
    metadata.nextFollowUp === validUntil
      ? remainingDeadlines[0] || ""
      : metadata.nextFollowUp;

  return {
    ...metadata,
    nextFollowUp,
    notes: withoutQuotationNote(
      metadata.notes,
      quotationNumber,
    ),
    updatedAt: new Date().toISOString(),
    quotations,
  };
}

export async function deleteQuotation(
  quotationId: string,
): Promise<DeleteQuotationResult> {
  const user = await requireUser();

  if (!quotationId.trim()) {
    return {
      ok: false,
      message: "La cotización no es válida.",
    };
  }

  const quotationLog =
    await prisma.activityLog.findFirst({
      where: {
        id: quotationId,
        entityType: "Quotation",
      },
    });
  const quotation = quotationLog
    ? parseQuotationMetadata(
        quotationLog.metadata,
      )
    : null;

  if (!quotationLog || !quotation) {
    return {
      ok: false,
      message:
        "La cotización ya no existe o su registro no es válido.",
    };
  }

  const settledPayment = await prisma.payment.findFirst({
    where: {
      status: "PAID",
      OR: [
        { reference: `quotation:${quotationId}` },
        ...(quotation.flowPaymentId
          ? [{ id: quotation.flowPaymentId }]
          : []),
      ],
    },
    select: { id: true },
  });

  if (
    quotation.commercialStatus === "ACCEPTED" ||
    quotation.commercialStatus === "PAID" ||
    quotation.saleId ||
    settledPayment
  ) {
    return {
      ok: false,
      message:
        "Una cotización aceptada o pagada forma parte del historial comercial y no se elimina. Gestiona su venta o cobro asociado.",
    };
  }

  const prospectMatches: Prisma.ActivityLogWhereInput[] = [
    ...(quotation.followUpId
      ? [{ id: quotation.followUpId }]
      : []),
    ...(quotationLog.clientId
      ? [{ clientId: quotationLog.clientId }]
      : []),
    ...(quotation.recipientEmail
      ? [{ entityId: quotation.recipientEmail }]
      : []),
    ...(quotation.clientName
      ? [{ entityId: quotation.clientName }]
      : []),
  ];
  const prospectLogs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Prospect",
        OR: prospectMatches,
      },
      take: 100,
    });
  const linkedProspects = prospectLogs
    .map((log) => ({
      log,
      metadata: parseProspectMetadata(
        log.metadata,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        log: (typeof prospectLogs)[number];
        metadata: ProspectMetadata;
      } =>
        Boolean(item.metadata) &&
        item.metadata!.quotations.some(
          (itemQuotation) =>
            itemQuotation.id === quotationId ||
            itemQuotation.number ===
              quotation.number,
        ),
    );

  await prisma.$transaction(
    async (transaction) => {
      if (quotation.flowPaymentId) {
        await transaction.payment.updateMany({
          where: {
            id: quotation.flowPaymentId,
            status: { in: ["PENDING", "OVERDUE"] },
          },
          data: {
            status: "CANCELLED",
            notes: `Pago cancelado porque ${quotation.number} fue eliminada.`,
          },
        });
      }

      for (const prospect of linkedProspects) {
        const nextMetadata =
          removeQuotationFromProspect(
            prospect.metadata,
            quotationId,
            quotation.number,
            quotation.validUntil,
          );

        await transaction.activityLog.update({
          where: {
            id: prospect.log.id,
          },
          data: {
            userId: user.id,
            action:
              "PROSPECT_QUOTATION_REMOVED",
            description: `${quotation.number} eliminada del seguimiento de ${quotation.clientName}.`,
            metadata: json(nextMetadata),
          },
        });
      }

      const deleted =
        await transaction.activityLog.deleteMany({
          where: {
            id: quotationId,
            entityType: "Quotation",
          },
        });

      if (deleted.count !== 1) {
        throw new Error(
          "La cotización cambió mientras se intentaba eliminar.",
        );
      }

      await transaction.activityLog.create({
        data: {
          userId: user.id,
          clientId:
            quotationLog.clientId || undefined,
          action: "QUOTATION_DELETED",
          entityType: "QuotationAudit",
          entityId: quotation.number,
          description: `${quotation.number} eliminada del historial de cotizaciones.`,
          metadata: {
            quotationId,
            quotationNumber: quotation.number,
            clientName: quotation.clientName,
            deletedAt: new Date().toISOString(),
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/cotizaciones");
  revalidatePath("/seguimiento");
  revalidatePath("/pagos");

  if (quotationLog.clientId) {
    revalidatePath(
      `/clientes/${quotationLog.clientId}`,
    );
  }

  return {
    ok: true,
    message: `${quotation.number} fue eliminada correctamente.`,
  };
}
