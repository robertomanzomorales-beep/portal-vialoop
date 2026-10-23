"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import {
  createQuotationPdf,
  type QuotationItem,
  type QuotationMetadata,
} from "@/lib/quotation";
import { buildQuotationEmail } from "@/lib/quotation-email";

export type QuotationActionState = {
  ok: boolean;
  message: string;
  quotationId?: string;
};

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

    await prisma.activityLog.update({
      where: {
        id: quotationLog.id,
      },
      data: {
        action: "QUOTATION_SENT",
        description: `${number} enviada a ${recipientEmail}.`,
        metadata: {
          ...metadata,
          emailStatus: "SENT",
          messageId: result.messageId,
        },
      },
    });

    revalidatePath("/");
    revalidatePath("/cotizaciones");
    revalidatePath(`/clientes/${clientId}`);

    return {
      ok: true,
      message: `${number} enviada correctamente a ${recipientEmail}.`,
      quotationId: quotationLog.id,
    };
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
}
