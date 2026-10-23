import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { parseProspectMetadata } from "@/lib/prospect";
import {
  parseQuotationMetadata,
  type QuotationMetadata,
} from "@/lib/quotation";
import { buildQuotationExpiryAlertEmail } from "@/lib/quotation-follow-up-email";
import { registerQuotationInFollowUp } from "@/lib/quotation-follow-up";

export type QuotationFollowUpAlertResult = {
  reviewed: number;
  registered: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    quotation: string;
    client: string;
    status:
      | "registered"
      | "sent"
      | "skipped"
      | "error";
    message: string;
  }>;
};

function json(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function getChileDateKey(
  date = new Date(),
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    },
  ).format(date);
}

function getDaysDifference(
  validUntil: string,
  today: string,
) {
  const expiration = new Date(
    `${validUntil}T12:00:00Z`,
  );
  const current = new Date(
    `${today}T12:00:00Z`,
  );

  if (
    Number.isNaN(expiration.getTime()) ||
    Number.isNaN(current.getTime())
  ) {
    return null;
  }

  return Math.round(
    (expiration.getTime() -
      current.getTime()) /
      86_400_000,
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1200)
    : "Error desconocido.";
}

function portalUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://portal-vialoop.vercel.app";
  const origin = /^https?:\/\//i.test(
    configured,
  )
    ? configured
    : `https://${configured}`;

  try {
    return new URL(
      "/seguimiento",
      origin,
    ).toString();
  } catch {
    return "https://portal-vialoop.vercel.app/seguimiento";
  }
}

async function isClosedFollowUp(
  followUpId?: string,
) {
  if (!followUpId) {
    return false;
  }

  const log =
    await prisma.activityLog.findFirst({
      where: {
        id: followUpId,
        entityType: "Prospect",
      },
      select: {
        metadata: true,
      },
    });
  const prospect =
    parseProspectMetadata(
      log?.metadata,
    );

  return (
    prospect?.status === "WON" ||
    prospect?.status === "LOST"
  );
}

export async function processQuotationFollowUpAlerts(): Promise<QuotationFollowUpAlertResult> {
  const result: QuotationFollowUpAlertResult = {
    reviewed: 0,
    registered: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };
  const today = getChileDateKey();
  const followUpUrl = portalUrl();
  const maximumEmails = 25;

  const logs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Quotation",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
      select: {
        id: true,
        userId: true,
        clientId: true,
        metadata: true,
        client: {
          select: {
            phone: true,
            mainContactName: true,
          },
        },
      },
    });

  result.reviewed = logs.length;

  for (const log of logs) {
    let quotation =
      parseQuotationMetadata(
        log.metadata,
      );

    if (
      !quotation ||
      quotation.emailStatus !== "SENT"
    ) {
      continue;
    }

    if (!quotation.followUpId) {
      try {
        const followUpId =
          await registerQuotationInFollowUp({
            quotationId: log.id,
            quotation,
            userId: log.userId,
            clientId: log.clientId,
            clientPhone:
              log.client?.phone,
            clientContactName:
              log.client
                ?.mainContactName,
          });
        quotation = {
          ...quotation,
          followUpId,
          followUpRegisteredAt:
            new Date().toISOString(),
        };

        await prisma.activityLog.update({
          where: {
            id: log.id,
          },
          data: {
            metadata: json(quotation),
          },
        });

        result.registered += 1;
        result.details.push({
          quotation: quotation.number,
          client: quotation.clientName,
          status: "registered",
          message:
            "Cotización incorporada al seguimiento comercial.",
        });
      } catch (error) {
        result.errors += 1;
        result.details.push({
          quotation: quotation.number,
          client: quotation.clientName,
          status: "error",
          message: `No se pudo registrar en Seguimiento: ${errorMessage(error)}`,
        });
        console.error(
          `Error al incorporar ${quotation.number} en Seguimiento:`,
          error,
        );
      }
    }

    const daysUntilExpiry =
      getDaysDifference(
        quotation.validUntil,
        today,
      );

    if (
      daysUntilExpiry === null ||
      daysUntilExpiry > 0 ||
      daysUntilExpiry < -7
    ) {
      continue;
    }

    result.eligible += 1;

    if (
      quotation.expiryNotificationSentAt
    ) {
      result.skipped += 1;
      continue;
    }

    if (
      await isClosedFollowUp(
        quotation.followUpId,
      )
    ) {
      result.skipped += 1;
      result.details.push({
        quotation: quotation.number,
        client: quotation.clientName,
        status: "skipped",
        message:
          "La oportunidad ya está cerrada como ganada o perdida.",
      });
      continue;
    }

    const recipient =
      quotation.senderEmail
        .trim()
        .toLowerCase();

    if (!isValidEmail(recipient)) {
      result.skipped += 1;
      result.details.push({
        quotation: quotation.number,
        client: quotation.clientName,
        status: "skipped",
        message:
          "La cotización no tiene un responsable con correo válido.",
      });
      continue;
    }

    if (result.sent >= maximumEmails) {
      result.skipped += 1;
      result.details.push({
        quotation: quotation.number,
        client: quotation.clientName,
        status: "skipped",
        message:
          "Se alcanzó el máximo de alertas de esta ejecución.",
      });
      continue;
    }

    const alert =
      buildQuotationExpiryAlertEmail(
        quotation,
        daysUntilExpiry,
        followUpUrl,
      );

    try {
      const mail = await sendEmail({
        to: recipient,
        subject: alert.subject,
        text: alert.text,
        html: alert.html,
        fromName:
          "Vialoop Seguimiento",
        replyTo: recipient,
        mailAccount: "default",
      });
      const sentAt =
        new Date().toISOString();
      const updatedMetadata: QuotationMetadata = {
        ...quotation,
        expiryNotificationSentAt:
          sentAt,
        expiryNotificationMessageId:
          mail.messageId,
        expiryNotificationLastAttemptAt:
          sentAt,
        expiryNotificationLastError:
          undefined,
      };

      await prisma.$transaction([
        prisma.activityLog.update({
          where: {
            id: log.id,
          },
          data: {
            metadata:
              json(updatedMetadata),
          },
        }),
        prisma.activityLog.create({
          data: {
            userId:
              log.userId || undefined,
            clientId:
              log.clientId || undefined,
            action:
              "QUOTATION_EXPIRY_NOTIFICATION_SENT",
            entityType:
              "QuotationFollowUp",
            entityId: log.id,
            description: `Alerta interna de vencimiento de ${quotation.number} enviada a ${recipient}.`,
            metadata: json({
              quotationNumber:
                quotation.number,
              recipient,
              validUntil:
                quotation.validUntil,
              daysUntilExpiry,
              messageId:
                mail.messageId,
            }),
          },
        }),
      ]);

      result.sent += 1;
      result.details.push({
        quotation: quotation.number,
        client: quotation.clientName,
        status: "sent",
        message: `Alerta interna enviada a ${recipient}.`,
      });
    } catch (error) {
      const attemptedAt =
        new Date().toISOString();
      const message = errorMessage(error);

      result.errors += 1;
      result.details.push({
        quotation: quotation.number,
        client: quotation.clientName,
        status: "error",
        message,
      });
      console.error(
        `Error al notificar el vencimiento de ${quotation.number}:`,
        error,
      );

      try {
        await prisma.activityLog.update({
          where: {
            id: log.id,
          },
          data: {
            metadata: json({
              ...quotation,
              expiryNotificationLastAttemptAt:
                attemptedAt,
              expiryNotificationLastError:
                message,
            }),
          },
        });
      } catch (updateError) {
        console.error(
          `No se pudo registrar el error de alerta de ${quotation.number}:`,
          updateError,
        );
      }
    }
  }

  return result;
}
