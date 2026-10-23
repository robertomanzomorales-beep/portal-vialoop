"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isProspectStatus,
  parseProspectMetadata,
  type ProspectMetadata,
} from "@/lib/prospect";

export type ProspectActionState = {
  ok: boolean;
  message: string;
  savedId?: string;
};

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
    nextFollowUp: validDateKey(
      value(formData, "nextFollowUp"),
    ),
    assignedTo: value(
      formData,
      "assignedTo",
    ),
    notes: value(formData, "notes"),
    updatedAt: new Date().toISOString(),
    quotations: [],
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

export async function deleteProspect(
  formData: FormData,
) {
  await requireUser();
  const id = value(formData, "id");

  if (!id) {
    return;
  }

  await prisma.activityLog.deleteMany({
    where: {
      id,
      entityType: "Prospect",
    },
  });

  revalidatePath("/");
  revalidatePath("/seguimiento");
}
