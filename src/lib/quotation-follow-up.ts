import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseProspectMetadata,
  type ProspectMetadata,
  type ProspectQuotation,
} from "@/lib/prospect";
import {
  parseQuotationMetadata,
  type QuotationMetadata,
} from "@/lib/quotation";

type RegisterQuotationFollowUpInput = {
  quotationId: string;
  quotation: QuotationMetadata;
  userId?: string | null;
  clientId?: string | null;
  clientPhone?: string | null;
  clientContactName?: string | null;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function formatDate(value: string) {
  const date = new Date(
    `${value}T12:00:00Z`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function getResponsible(
  quotation: QuotationMetadata,
) {
  const sender =
    `${quotation.senderName} ${quotation.senderEmail}`.toLowerCase();

  return sender.includes("roberto") ||
    sender.includes("rmanzo@")
    ? "Roberto"
    : "Doris";
}

function getNextFollowUp(
  current: string,
  validUntil: string,
) {
  const today = getChileDateKey();

  if (
    current &&
    current >= today &&
    current <= validUntil
  ) {
    return current;
  }

  return validUntil;
}

function appendQuotationNote(
  notes: string,
  quotation: QuotationMetadata,
) {
  if (notes.includes(quotation.number)) {
    return notes;
  }

  const entry = [
    `Cotización ${quotation.number} enviada por ${formatCurrency(quotation.totalAmount)}.`,
    quotation.validUntil
      ? `Vigencia hasta ${formatDate(quotation.validUntil)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [notes.trim(), entry]
    .filter(Boolean)
    .join("\n");
}

function quotationSnapshot(
  quotationId: string,
  quotation: QuotationMetadata,
): ProspectQuotation {
  return {
    id: quotationId,
    number: quotation.number,
    projectName: quotation.projectName,
    recipientEmail:
      quotation.recipientEmail,
    items: quotation.items.map(
      (item) => ({
        description: item.description,
        quantity: item.quantity,
      }),
    ),
    totalAmount: quotation.totalAmount,
    issuedAt: quotation.issuedAt,
    validUntil: quotation.validUntil,
    pdfPath: `/api/cotizaciones/${quotationId}/pdf`,
  };
}

function quotedInterest(
  quotation: QuotationMetadata,
) {
  return (
    quotation.projectName.trim() ||
    quotation.items
      .map((item) => item.description)
      .slice(0, 3)
      .join(" · ") ||
    "Propuesta comercial"
  );
}

export async function registerQuotationInFollowUp({
  quotationId,
  quotation,
  userId,
  clientId,
  clientPhone,
  clientContactName,
}: RegisterQuotationFollowUpInput) {
  const candidates =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Prospect",
        OR: [
          ...(quotation.followUpId
            ? [
                {
                  id: quotation.followUpId,
                },
              ]
            : []),
          ...(clientId
            ? [
                {
                  clientId,
                },
              ]
            : []),
          {
            entityId:
              quotation.recipientEmail,
          },
          {
            entityId:
              quotation.clientName,
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        id: true,
        metadata: true,
      },
    });

  const parsedCandidates = candidates
    .map((candidate) => ({
      id: candidate.id,
      metadata:
        parseProspectMetadata(
          candidate.metadata,
        ),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        id: string;
        metadata: ProspectMetadata;
      } => Boolean(candidate.metadata),
    );

  const existing =
    parsedCandidates.find(
      (candidate) =>
        candidate.metadata.quotations.some(
          (item) =>
            item.id === quotationId ||
            item.number === quotation.number,
        ),
    ) ??
    parsedCandidates.find(
      (candidate) =>
        candidate.id ===
        quotation.followUpId,
    ) ??
    parsedCandidates.find(
      (candidate) =>
        candidate.metadata.status !==
          "WON" &&
        candidate.metadata.status !==
          "LOST" &&
        candidate.metadata.quotations
          .length === 0,
    );

  const previous = existing?.metadata;
  const snapshot = quotationSnapshot(
    quotationId,
    quotation,
  );
  const alreadyLinked = Boolean(
    previous?.quotations.some(
      (item) =>
        item.id === quotationId ||
        item.number === quotation.number,
    ),
  );
  const quotations = [
    snapshot,
    ...(previous?.quotations ?? []).filter(
      (item) =>
        item.id !== quotationId &&
        item.number !== quotation.number,
    ),
  ].slice(0, 20);

  const metadata: ProspectMetadata = {
    company: quotation.clientName,
    contactName:
      quotation.contactName ||
      previous?.contactName ||
      clientContactName?.trim() ||
      "",
    email: quotation.recipientEmail,
    phone:
      previous?.phone ||
      clientPhone?.trim() ||
      "",
    industry: previous?.industry || "",
    source:
      previous?.source ||
      "Cotización Vialoop",
    status:
      alreadyLinked &&
      previous
        ? previous.status
        : "FOLLOW_UP",
    interest: quotedInterest(quotation),
    nextFollowUp:
      alreadyLinked &&
      previous &&
      (previous.status === "WON" ||
        previous.status === "LOST")
        ? previous.nextFollowUp
        : getNextFollowUp(
            previous?.nextFollowUp || "",
            quotation.validUntil,
          ),
    assignedTo:
      previous?.assignedTo ||
      getResponsible(quotation),
    notes: appendQuotationNote(
      previous?.notes || "",
      quotation,
    ),
    updatedAt: new Date().toISOString(),
    quotations,
  };

  if (existing) {
    await prisma.activityLog.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(userId
          ? { userId }
          : {}),
        ...(clientId
          ? { clientId }
          : {}),
        action:
          "PROSPECT_QUOTATION_REGISTERED",
        entityId:
          quotation.recipientEmail ||
          quotation.clientName,
        description: `${quotation.number} registrada en el seguimiento de ${quotation.clientName}.`,
        metadata: json(metadata),
      },
    });

    return existing.id;
  }

  const followUp =
    await prisma.activityLog.create({
      data: {
        userId: userId || undefined,
        clientId: clientId || undefined,
        action:
          "PROSPECT_QUOTATION_REGISTERED",
        entityType: "Prospect",
        entityId:
          quotation.recipientEmail ||
          quotation.clientName,
        description: `${quotation.number} agregada al seguimiento comercial de ${quotation.clientName}.`,
        metadata: json(metadata),
      },
      select: {
        id: true,
      },
    });

  return followUp.id;
}

export type QuotationFollowUpSyncResult = {
  reviewed: number;
  registered: number;
  errors: number;
};

export async function syncSentQuotationsToFollowUp(
  limit = 500,
): Promise<QuotationFollowUpSyncResult> {
  const logs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Quotation",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
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

  const quotations = logs
    .map((log) => ({
      log,
      quotation:
        parseQuotationMetadata(
          log.metadata,
        ),
    }))
    .filter(
      (
        item,
      ): item is typeof item & {
        quotation: QuotationMetadata;
      } =>
        Boolean(item.quotation) &&
        item.quotation?.emailStatus ===
          "SENT" &&
        !item.quotation
          ?.followUpDismissedAt,
    );

  const linkedIds = quotations
    .map(
      ({ quotation }) =>
        quotation.followUpId,
    )
    .filter(
      (id): id is string => Boolean(id),
    );
  const existingLinks =
    linkedIds.length > 0
      ? await prisma.activityLog.findMany({
          where: {
            id: {
              in: linkedIds,
            },
            entityType: "Prospect",
          },
          select: {
            id: true,
          },
        })
      : [];
  const existingLinkIds = new Set(
    existingLinks.map((item) => item.id),
  );

  const result: QuotationFollowUpSyncResult = {
    reviewed: quotations.length,
    registered: 0,
    errors: 0,
  };

  for (const {
    log,
    quotation,
  } of quotations) {
    if (
      quotation.followUpId &&
      existingLinkIds.has(
        quotation.followUpId,
      )
    ) {
      continue;
    }

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

      await prisma.activityLog.update({
        where: {
          id: log.id,
        },
        data: {
          metadata: json({
            ...quotation,
            followUpId,
            followUpRegisteredAt:
              new Date().toISOString(),
          }),
        },
      });

      existingLinkIds.add(followUpId);
      result.registered += 1;
    } catch (error) {
      result.errors += 1;
      console.error(
        `No fue posible sincronizar ${quotation.number} con Seguimiento:`,
        error,
      );
    }
  }

  return result;
}
