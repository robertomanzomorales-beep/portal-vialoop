"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isProspectStatus,
  parseProspectMetadata,
  type ProspectMetadata,
} from "@/lib/prospect";
import { parseQuotationMetadata } from "@/lib/quotation";

export type ProspectActionState = {
  ok: boolean;
  message: string;
  savedId?: string;
  deletedId?: string;
};

function json(
  input: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(input),
  ) as Prisma.InputJsonValue;
}

function value(
  formData: FormData,
  key: string,
) {
  const entry = formData.get(key);

  return typeof entry === "string"
    ? entry.trim()
    : "";
}

function validDateKey(value: string) {
  if (!value) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(
    value,
  )
    ? value
    : "";
}

export async function saveProspect(
  _previousState: ProspectActionState,
  formData: FormData,
): Promise<ProspectActionState> {
  const user = await requireUser();
  const id = value(formData, "id");
  const company = value(
    formData,
    "company",
  );
  const statusValue = value(
    formData,
    "status",
  );

  if (!company) {
    return {
      ok: false,
      message:
        "Ingresa el nombre de la empresa o prospecto.",
    };
  }

  if (!isProspectStatus(statusValue)) {
    return {
      ok: false,
      message:
        "Selecciona un estado válido.",
    };
  }

  const metadata: ProspectMetadata = {
    company,
    contactName: value(
      formData,
      "contactName",
    ),
    email: value(
      formData,
      "email",
    ).toLowerCase(),
    phone: value(formData, "phone"),
    industry: value(
      formData,
      "industry",
    ),
    source: value(formData, "source"),
    status: statusValue,
    interest: value(
      formData,
      "interest",
    ),
    lastContactAt: validDateKey(
      value(formData, "lastContactAt"),
    ),
    nextFollowUp: validDateKey(
      value(formData, "nextFollowUp"),
    ),
    nextAction: value(formData, "nextAction"),
    assignedTo: value(
      formData,
      "assignedTo",
    ),
    notes: value(formData, "notes"),
    updatedAt: new Date().toISOString(),
    quotations: [],
    activities: [],
  };

  if (id) {
    const existing =
      await prisma.activityLog.findFirst({
        where: {
          id,
          entityType: "Prospect",
        },
        select: {
          id: true,
          metadata: true,
        },
      });

    if (!existing) {
      return {
        ok: false,
        message:
          "El prospecto ya no existe.",
      };
    }

    const previous =
      parseProspectMetadata(
        existing.metadata,
      );

    const updatedMetadata: ProspectMetadata = {
      ...metadata,
      quotations:
        previous?.quotations ?? [],
      activities:
        previous?.activities ?? [],
    };

    await prisma.activityLog.update({
      where: { id },
      data: {
        userId: user.id,
        action: "PROSPECT_UPDATED",
        entityId:
          updatedMetadata.email ||
          updatedMetadata.company,
        description: `${updatedMetadata.company} actualizado de ${previous?.status ?? "sin estado"} a ${updatedMetadata.status}.`,
        metadata: updatedMetadata,
      },
    });

    revalidatePath("/");
    revalidatePath("/seguimiento");

    return {
      ok: true,
      message: `${updatedMetadata.company} actualizado correctamente.`,
      savedId: id,
    };
  }

  const prospect =
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "PROSPECT_CREATED",
        entityType: "Prospect",
        entityId:
          metadata.email ||
          metadata.company,
        description: `${metadata.company} agregado al seguimiento comercial.`,
        metadata,
      },
    });

  revalidatePath("/");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: `${metadata.company} agregado al seguimiento.`,
    savedId: prospect.id,
  };
}

export async function addProspectActivity(
  id: string,
  formData: FormData,
): Promise<ProspectActionState> {
  const user = await requireUser();
  const contactedAt = validDateKey(value(formData, "contactedAt"));
  const nextFollowUp = validDateKey(value(formData, "nextFollowUp"));
  const action = value(formData, "action");
  const note = value(formData, "note");
  const responsible = value(formData, "responsible");

  if (!id || !contactedAt || !action) {
    return {
      ok: false,
      message: "Indica la fecha de la gestión y la próxima acción.",
    };
  }

  const existing = await prisma.activityLog.findFirst({
    where: {
      id,
      entityType: "Prospect",
    },
    select: {
      id: true,
      metadata: true,
    },
  });
  const prospect = existing ? parseProspectMetadata(existing.metadata) : null;

  if (!existing || !prospect) {
    return {
      ok: false,
      message: "La oportunidad ya no existe.",
    };
  }

  const now = new Date().toISOString();
  const nextMetadata: ProspectMetadata = {
    ...prospect,
    status: prospect.status === "NEW" ? "CONTACTED" : prospect.status,
    lastContactAt: contactedAt,
    nextFollowUp,
    nextAction: action,
    assignedTo: responsible || prospect.assignedTo,
    updatedAt: now,
    activities: [
      {
        id: randomUUID(),
        contactedAt,
        nextFollowUp,
        action,
        note,
        responsible: responsible || prospect.assignedTo || "Equipo",
        createdAt: now,
      },
      ...prospect.activities,
    ].slice(0, 100),
  };

  await prisma.activityLog.update({
    where: { id },
    data: {
      userId: user.id,
      action: "PROSPECT_ACTIVITY_RECORDED",
      description: `Gestión registrada para ${prospect.company}: ${action}.`,
      metadata: json(nextMetadata),
    },
  });

  revalidatePath("/");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: `Gestión registrada para ${prospect.company}.`,
    savedId: id,
  };
}

export async function deleteProspect(
  id: string,
): Promise<ProspectActionState> {
  await requireUser();

  if (!id) {
    return {
      ok: false,
      message:
        "No fue posible identificar la oportunidad.",
    };
  }

  const existing =
    await prisma.activityLog.findFirst({
      where: {
        id,
        entityType: "Prospect",
      },
      select: {
        id: true,
        metadata: true,
      },
    });

  if (!existing) {
    return {
      ok: false,
      message:
        "La oportunidad ya no existe.",
    };
  }

  const prospect =
    parseProspectMetadata(
      existing.metadata,
    );
  const quotationIds =
    prospect?.quotations.map(
      (quotation) => quotation.id,
    ) ?? [];
  const quotationLogs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Quotation",
        OR: [
          ...(quotationIds.length > 0
            ? [
                {
                  id: {
                    in: quotationIds,
                  },
                },
              ]
            : []),
          {
            metadata: {
              path: ["followUpId"],
              equals: id,
            },
          },
        ],
      },
      select: {
        id: true,
        metadata: true,
      },
    });
  const dismissedAt =
    new Date().toISOString();
  const quotationUpdates =
    quotationLogs.flatMap((log) => {
      const quotation =
        parseQuotationMetadata(
          log.metadata,
        );

      if (!quotation) {
        return [];
      }

      return [
        prisma.activityLog.update({
          where: {
            id: log.id,
          },
          data: {
            metadata: json({
              ...quotation,
              followUpId: undefined,
              followUpRegisteredAt:
                undefined,
              followUpDismissedAt:
                dismissedAt,
            }),
          },
        }),
      ];
    });

  await prisma.$transaction([
    ...quotationUpdates,
    prisma.activityLog.deleteMany({
      where: {
        id,
        entityType: "Prospect",
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/cotizaciones");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: `${prospect?.company || "La oportunidad"} fue eliminada del seguimiento. La cotización permanece en su historial.`,
    deletedId: id,
  };
}
