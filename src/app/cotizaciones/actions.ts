"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
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
          ? item.description.trim().slice(0, 160)
          : "",
      detail:
        typeof item.detail === "string"
          ? item.detail.trim().slice(0, 1000)
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
    .slice(0, 20);
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

export async function createAndSendQuotation(
  _previousState: QuotationActionState,
  formData: FormData,
): Promise<QuotationActionState> {
  const user = await requireUser();

  const clientId = text(
    formData,
    "clientId",
  );

  const recipientEmail = text(
    formData,
    "recipientEmail",
  ).toLowerCase();

  const contactName = text(
    formData,
    "contactName",
  ).slice(0, 120);

  const projectName = text(
    formData,
    "projectName",
  ).slice(0, 160);

  const notes = text(
    formData,
    "notes",
  ).slice(0, 2000);

  const items = parseItems(
    text(formData, "items"),
  );

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

  const client =
    await prisma.client.findUnique({
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
    });

  if (!client) {
    return {
      ok: false,
      message:
        "El cliente seleccionado ya no existe.",
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

  const counter =
    await prisma.counter.upsert({
      where: {
        key: "quotation-number",
      },
      update: {
        nextValue: {
          increment: 1,
        },
      },
      create: {
        key: "quotation-number",
        nextValue: 2,
      },
      select: {
        nextValue: true,
      },
    });

  const sequentialNumber =
    counter.nextValue - 1;

  const number = `COT-${now.getUTCFullYear()}-${sequentialNumber
    .toString()
    .padStart(4, "0")}`;

  const metadata: QuotationMetadata = {
    number,
    clientId,
    clientName:
      client.tradeName ||
      client.businessName,
    clientTaxId:
      client.rut || undefined,
    contactName,
    recipientEmail,
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
    emailStatus: "PENDING",
  };

  const quotationLog =
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        clientId,
        action: "QUOTATION_CREATED",
        entityType: "Quotation",
        entityId: number,
        description: `${number} preparada para ${metadata.clientName}.`,
        metadata,
      },
    });

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
        metadata: {
          ...metadata,
          emailStatus: "FAILED",
          lastError: message,
        },
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
        metadata: sentMetadata,
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
        metadata: {
          ...sentMetadata,
          followUpId,
          followUpRegisteredAt:
            new Date().toISOString(),
        },
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
  revalidatePath(`/clientes/${clientId}`);

  return {
    ok: true,
    message: followUpRegistered
      ? `${number} enviada a ${recipientEmail} y registrada en Seguimiento.`
      : `${number} enviada a ${recipientEmail}; revisa el registro manual en Seguimiento.`,
    quotationId: quotationLog.id,
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
