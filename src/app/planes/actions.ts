"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type PlanType =
  | "ESSENTIAL"
  | "MANAGEMENT"
  | "ACTIVE"
  | "CUSTOM";

const allowedPlanTypes: PlanType[] = [
  "ESSENTIAL",
  "MANAGEMENT",
  "ACTIVE",
  "CUSTOM",
];

function getRequiredString(
  formData: FormData,
  field: string,
  label: string,
) {
  const value = formData.get(field);

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(`${label} es obligatorio.`);
  }

  return value.trim();
}

function getOptionalString(
  formData: FormData,
  field: string,
) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : null;
}

function parsePositiveAmount(
  formData: FormData,
  field: string,
  label: string,
) {
  const rawValue = getRequiredString(
    formData,
    field,
    label,
  );

  const value = Number(rawValue);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${label} debe ser un monto mayor que cero.`,
    );
  }

  return Math.round(value);
}

function parseNonNegativeInteger(
  formData: FormData,
  field: string,
  label: string,
) {
  const rawValue = getRequiredString(
    formData,
    field,
    label,
  );

  const value = Number(rawValue);

  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} debe ser un número entero igual o mayor que cero.`,
    );
  }

  return value;
}

function parseOptionalPositiveInteger(
  formData: FormData,
  field: string,
  label: string,
) {
  const rawValue = getOptionalString(
    formData,
    field,
  );

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${label} debe ser un número entero mayor que cero.`,
    );
  }

  return value;
}

function getPlanType(
  formData: FormData,
): PlanType {
  const value = getRequiredString(
    formData,
    "type",
    "El tipo de plan",
  );

  if (
    !allowedPlanTypes.includes(
      value as PlanType,
    )
  ) {
    throw new Error(
      "El tipo de plan seleccionado no es válido.",
    );
  }

  return value as PlanType;
}

function getPlanTypeLabel(type: string) {
  const labels: Record<string, string> = {
    ESSENTIAL: "Esencial",
    MANAGEMENT: "Gestión",
    ACTIVE: "Activo",
    CUSTOM: "Personalizado",
  };

  return labels[type] ?? type;
}

function isChecked(
  formData: FormData,
  field: string,
) {
  return formData.get(field) === "on";
}

export async function createPlan(
  formData: FormData,
) {
  const name = getRequiredString(
    formData,
    "name",
    "El nombre",
  );

  const type = getPlanType(formData);

  const monthlyPrice = parsePositiveAmount(
    formData,
    "monthlyPrice",
    "El precio mensual",
  );

  const includedRequests =
    parseNonNegativeInteger(
      formData,
      "includedRequests",
      "Las solicitudes incluidas",
    );

  const responseHours =
    parseOptionalPositiveInteger(
      formData,
      "responseHours",
      "El tiempo de respuesta",
    );

  const description = getOptionalString(
    formData,
    "description",
  );

  const active = isChecked(
    formData,
    "active",
  );

  const existingType =
    await prisma.plan.findUnique({
      where: {
        type,
      },
      select: {
        id: true,
      },
    });

  if (existingType) {
    redirect(
      "/planes/nuevo?error=tipo-duplicado",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      const plan =
        await transaction.plan.create({
          data: {
            name,
            type,
            monthlyPrice,
            includedRequests,
            responseHours,
            description,
            active,
          },
        });

      await transaction.activityLog.create({
        data: {
          action: "PLAN_CREATED",
          entityType: "Plan",
          entityId: plan.id,
          description: `${name} fue creado como plan ${getPlanTypeLabel(
            type,
          ).toLowerCase()}.`,
          metadata: {
            name,
            type,
            monthlyPrice,
            includedRequests,
            responseHours,
            active,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/planes");

  redirect("/planes?resultado=creado");
}

export async function updatePlan(
  planId: string,
  formData: FormData,
) {
  const existingPlan =
    await prisma.plan.findUnique({
      where: {
        id: planId,
      },
    });

  if (!existingPlan) {
    throw new Error(
      "El plan seleccionado no existe.",
    );
  }

  const name = getRequiredString(
    formData,
    "name",
    "El nombre",
  );

  const type = getPlanType(formData);

  const monthlyPrice = parsePositiveAmount(
    formData,
    "monthlyPrice",
    "El precio mensual",
  );

  const includedRequests =
    parseNonNegativeInteger(
      formData,
      "includedRequests",
      "Las solicitudes incluidas",
    );

  const responseHours =
    parseOptionalPositiveInteger(
      formData,
      "responseHours",
      "El tiempo de respuesta",
    );

  const description = getOptionalString(
    formData,
    "description",
  );

  const active = isChecked(
    formData,
    "active",
  );

  const duplicatedType =
    await prisma.plan.findFirst({
      where: {
        type,
        id: {
          not: planId,
        },
      },
      select: {
        id: true,
      },
    });

  if (duplicatedType) {
    redirect(
      `/planes/${planId}/editar?error=tipo-duplicado`,
    );
  }

  const changes: string[] = [];

  if (existingPlan.name !== name) {
    changes.push(
      `Nombre: ${existingPlan.name} → ${name}`,
    );
  }

  if (existingPlan.type !== type) {
    changes.push(
      `Tipo: ${getPlanTypeLabel(
        existingPlan.type,
      )} → ${getPlanTypeLabel(type)}`,
    );
  }

  if (
    Number(existingPlan.monthlyPrice) !==
    monthlyPrice
  ) {
    changes.push(
      "Precio mensual actualizado",
    );
  }

  if (
    existingPlan.includedRequests !==
    includedRequests
  ) {
    changes.push(
      "Solicitudes incluidas actualizadas",
    );
  }

  if (
    existingPlan.responseHours !==
    responseHours
  ) {
    changes.push(
      "Tiempo de respuesta actualizado",
    );
  }

  if (
    existingPlan.description !== description
  ) {
    changes.push("Descripción actualizada");
  }

  if (existingPlan.active !== active) {
    changes.push(
      active
        ? "Plan activado"
        : "Plan desactivado",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      await transaction.plan.update({
        where: {
          id: planId,
        },
        data: {
          name,
          type,
          monthlyPrice,
          includedRequests,
          responseHours,
          description,
          active,
        },
      });

      await transaction.activityLog.create({
        data: {
          action: "PLAN_UPDATED",
          entityType: "Plan",
          entityId: planId,
          description:
            changes.length > 0
              ? changes.join(". ")
              : "El plan fue guardado sin cambios.",
          metadata: {
            name,
            type,
            monthlyPrice,
            includedRequests,
            responseHours,
            active,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/planes");
  revalidatePath(
    `/planes/${planId}/editar`,
  );

  redirect(
    `/planes/${planId}/editar?resultado=actualizado`,
  );
}

export async function togglePlanStatus(
  planId: string,
) {
  const plan =
    await prisma.plan.findUnique({
      where: {
        id: planId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
      },
    });

  if (!plan) {
    throw new Error(
      "El plan seleccionado no existe.",
    );
  }

  const nextStatus = !plan.active;

  await prisma.$transaction(
    async (transaction) => {
      await transaction.plan.update({
        where: {
          id: plan.id,
        },
        data: {
          active: nextStatus,
        },
      });

      await transaction.activityLog.create({
        data: {
          action: nextStatus
            ? "PLAN_ACTIVATED"
            : "PLAN_DEACTIVATED",
          entityType: "Plan",
          entityId: plan.id,
          description: `${plan.name} fue ${
            nextStatus
              ? "activado"
              : "desactivado"
          }.`,
          metadata: {
            name: plan.name,
            type: plan.type,
            active: nextStatus,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/planes");

  redirect(
    `/planes?resultado=${
      nextStatus
        ? "activado"
        : "desactivado"
    }`,
  );
}