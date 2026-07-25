"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

type BillingCycle =
  | "MONTHLY"
  | "SEMIANNUAL"
  | "ANNUAL";

const allowedStatuses: SubscriptionStatus[] = [
  "ACTIVE",
  "PENDING",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
];

const allowedBillingCycles: BillingCycle[] = [
  "MONTHLY",
  "SEMIANNUAL",
  "ANNUAL",
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

function parseAmount(
  formData: FormData,
  field: string,
  label: string,
) {
  const rawValue = getRequiredString(
    formData,
    field,
    label,
  )
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

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

function parseRequiredDate(
  formData: FormData,
  field: string,
  label: string,
) {
  const value = getRequiredString(
    formData,
    field,
    label,
  );

  const date = new Date(
    `${value}T12:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `${label} no es una fecha válida.`,
    );
  }

  return date;
}

function parseOptionalDate(
  formData: FormData,
  field: string,
) {
  const value = getOptionalString(
    formData,
    field,
  );

  if (!value) {
    return null;
  }

  const date = new Date(
    `${value}T12:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Una de las fechas ingresadas no es válida.",
    );
  }

  return date;
}

function getStatus(
  formData: FormData,
): SubscriptionStatus {
  const value = getRequiredString(
    formData,
    "status",
    "El estado",
  );

  if (
    !allowedStatuses.includes(
      value as SubscriptionStatus,
    )
  ) {
    throw new Error(
      "El estado seleccionado no es válido.",
    );
  }

  return value as SubscriptionStatus;
}

function getBillingCycle(
  formData: FormData,
): BillingCycle {
  const value = getRequiredString(
    formData,
    "billingCycle",
    "El ciclo de cobro",
  );

  if (
    !allowedBillingCycles.includes(
      value as BillingCycle,
    )
  ) {
    throw new Error(
      "El ciclo de cobro seleccionado no es válido.",
    );
  }

  return value as BillingCycle;
}

function validateDates({
  startsAt,
  renewsAt,
  endsAt,
}: {
  startsAt: Date;
  renewsAt: Date | null;
  endsAt: Date | null;
}) {
  if (
    renewsAt &&
    renewsAt < startsAt
  ) {
    throw new Error(
      "La próxima renovación no puede ser anterior al inicio de la suscripción.",
    );
  }

  if (
    endsAt &&
    endsAt < startsAt
  ) {
    throw new Error(
      "La fecha de término no puede ser anterior al inicio de la suscripción.",
    );
  }

  if (
    renewsAt &&
    endsAt &&
    renewsAt > endsAt
  ) {
    throw new Error(
      "La próxima renovación no puede ser posterior a la fecha de término.",
    );
  }
}

function getStatusLabel(
  status: string,
) {
  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    PENDING: "Pendiente",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
  };

  return labels[status] ?? status;
}

function getBillingCycleLabel(
  cycle: string,
) {
  const labels: Record<string, string> = {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  return labels[cycle] ?? cycle;
}

async function validateRelations({
  clientId,
  projectId,
  planId,
  requireActivePlan,
}: {
  clientId: string;
  projectId: string | null;
  planId: string;
  requireActivePlan: boolean;
}) {
  const [client, project, plan] =
    await Promise.all([
      prisma.client.findUnique({
        where: {
          id: clientId,
        },
        select: {
          id: true,
          businessName: true,
        },
      }),

      projectId
        ? prisma.project.findUnique({
            where: {
              id: projectId,
            },
            select: {
              id: true,
              clientId: true,
              name: true,
              domain: true,
            },
          })
        : Promise.resolve(null),

      prisma.plan.findUnique({
        where: {
          id: planId,
        },
        select: {
          id: true,
          name: true,
          active: true,
        },
      }),
    ]);

  if (!client) {
    throw new Error(
      "El cliente seleccionado no existe.",
    );
  }

  if (!plan) {
    throw new Error(
      "El plan seleccionado no existe.",
    );
  }

  if (
    requireActivePlan &&
    !plan.active
  ) {
    throw new Error(
      "El plan seleccionado está inactivo y no puede utilizarse en una nueva suscripción.",
    );
  }

  if (
    project &&
    project.clientId !== client.id
  ) {
    throw new Error(
      "El proyecto seleccionado no pertenece al cliente indicado.",
    );
  }

  return {
    client,
    project,
    plan,
  };
}

export async function createSubscription(
  formData: FormData,
) {
  const clientId = getRequiredString(
    formData,
    "clientId",
    "El cliente",
  );

  const projectId = getOptionalString(
    formData,
    "projectId",
  );

  const planId = getRequiredString(
    formData,
    "planId",
    "El plan",
  );

  const status = getStatus(formData);

  const billingCycle =
    getBillingCycle(formData);

  const agreedPrice = parseAmount(
    formData,
    "agreedPrice",
    "El precio acordado",
  );

  const requestsUsed =
    parseNonNegativeInteger(
      formData,
      "requestsUsed",
      "Las solicitudes utilizadas",
    );

  const startsAt = parseRequiredDate(
    formData,
    "startsAt",
    "La fecha de inicio",
  );

  const renewsAt = parseOptionalDate(
    formData,
    "renewsAt",
  );

  const endsAt = parseOptionalDate(
    formData,
    "endsAt",
  );

  const notes = getOptionalString(
    formData,
    "notes",
  );

  validateDates({
    startsAt,
    renewsAt,
    endsAt,
  });

  const {
    client,
    project,
    plan,
  } = await validateRelations({
    clientId,
    projectId,
    planId,
    requireActivePlan: true,
  });

  const duplicatedSubscription =
    await prisma.subscription.findFirst({
      where: {
        clientId,
        projectId,
        planId,
        status: {
          in: [
            "ACTIVE",
            "PENDING",
            "SUSPENDED",
          ],
        },
      },
      select: {
        id: true,
      },
    });

  if (duplicatedSubscription) {
    redirect(
      "/suscripciones/nuevo?error=duplicada",
    );
  }

  const subscription =
    await prisma.$transaction(
      async (transaction) => {
        const createdSubscription =
          await transaction.subscription.create({
            data: {
              clientId,
              projectId,
              planId,
              status,
              billingCycle,
              agreedPrice,
              requestsUsed,
              startsAt,
              renewsAt,
              endsAt,
              notes,
            },
          });

        await transaction.activityLog.create({
          data: {
            clientId,
            projectId,
            action: "SUBSCRIPTION_CREATED",
            entityType: "Subscription",
            entityId:
              createdSubscription.id,
            description: `Se creó la suscripción de ${client.businessName} al plan ${plan.name}.`,
            metadata: {
              clientId,
              projectId,
              planId,
              status,
              billingCycle,
              agreedPrice,
              requestsUsed,
              startsAt:
                startsAt.toISOString(),
              renewsAt:
                renewsAt?.toISOString() ??
                null,
              endsAt:
                endsAt?.toISOString() ??
                null,
              project:
                project?.domain ??
                project?.name ??
                null,
            },
          },
        });

        return createdSubscription;
      },
    );

  revalidatePath("/");
  revalidatePath("/planes");
  revalidatePath("/suscripciones");
  revalidatePath(
    `/clientes/${clientId}`,
  );

  redirect(
    `/suscripciones/${subscription.id}/editar?resultado=creada`,
  );
}

export async function updateSubscription(
  subscriptionId: string,
  formData: FormData,
) {
  const existingSubscription =
    await prisma.subscription.findUnique({
      where: {
        id: subscriptionId,
      },
      include: {
        client: true,
        project: true,
        plan: true,
      },
    });

  if (!existingSubscription) {
    throw new Error(
      "La suscripción seleccionada no existe.",
    );
  }

  const clientId = getRequiredString(
    formData,
    "clientId",
    "El cliente",
  );

  const projectId = getOptionalString(
    formData,
    "projectId",
  );

  const planId = getRequiredString(
    formData,
    "planId",
    "El plan",
  );

  const status = getStatus(formData);

  const billingCycle =
    getBillingCycle(formData);

  const agreedPrice = parseAmount(
    formData,
    "agreedPrice",
    "El precio acordado",
  );

  const requestsUsed =
    parseNonNegativeInteger(
      formData,
      "requestsUsed",
      "Las solicitudes utilizadas",
    );

  const startsAt = parseRequiredDate(
    formData,
    "startsAt",
    "La fecha de inicio",
  );

  const renewsAt = parseOptionalDate(
    formData,
    "renewsAt",
  );

  const endsAt = parseOptionalDate(
    formData,
    "endsAt",
  );

  const notes = getOptionalString(
    formData,
    "notes",
  );

  validateDates({
    startsAt,
    renewsAt,
    endsAt,
  });

  const {
    client,
    project,
    plan,
  } = await validateRelations({
    clientId,
    projectId,
    planId,
    requireActivePlan: false,
  });

  const duplicatedSubscription =
    await prisma.subscription.findFirst({
      where: {
        id: {
          not: subscriptionId,
        },
        clientId,
        projectId,
        planId,
        status: {
          in: [
            "ACTIVE",
            "PENDING",
            "SUSPENDED",
          ],
        },
      },
      select: {
        id: true,
      },
    });

  if (duplicatedSubscription) {
    redirect(
      `/suscripciones/${subscriptionId}/editar?error=duplicada`,
    );
  }

  const changes: string[] = [];

  if (
    existingSubscription.clientId !==
    clientId
  ) {
    changes.push(
      `Cliente: ${existingSubscription.client.businessName} → ${client.businessName}`,
    );
  }

  if (
    existingSubscription.projectId !==
    projectId
  ) {
    changes.push(
      `Proyecto: ${
        existingSubscription.project
          ?.domain ??
        existingSubscription.project
          ?.name ??
        "Sin proyecto"
      } → ${
        project?.domain ??
        project?.name ??
        "Sin proyecto"
      }`,
    );
  }

  if (
    existingSubscription.planId !==
    planId
  ) {
    changes.push(
      `Plan: ${existingSubscription.plan.name} → ${plan.name}`,
    );
  }

  if (
    existingSubscription.status !==
    status
  ) {
    changes.push(
      `Estado: ${getStatusLabel(
        existingSubscription.status,
      )} → ${getStatusLabel(status)}`,
    );
  }

  if (
    existingSubscription.billingCycle !==
    billingCycle
  ) {
    changes.push(
      `Ciclo: ${getBillingCycleLabel(
        existingSubscription.billingCycle,
      )} → ${getBillingCycleLabel(
        billingCycle,
      )}`,
    );
  }

  if (
    Number(
      existingSubscription.agreedPrice,
    ) !== agreedPrice
  ) {
    changes.push(
      "Precio acordado actualizado",
    );
  }

  if (
    existingSubscription.requestsUsed !==
    requestsUsed
  ) {
    changes.push(
      "Solicitudes utilizadas actualizadas",
    );
  }

  if (
    existingSubscription.notes !== notes
  ) {
    changes.push(
      "Notas internas actualizadas",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      await transaction.subscription.update({
        where: {
          id: subscriptionId,
        },
        data: {
          clientId,
          projectId,
          planId,
          status,
          billingCycle,
          agreedPrice,
          requestsUsed,
          startsAt,
          renewsAt,
          endsAt,
          notes,
        },
      });

      await transaction.activityLog.create({
        data: {
          clientId,
          projectId,
          action: "SUBSCRIPTION_UPDATED",
          entityType: "Subscription",
          entityId: subscriptionId,
          description:
            changes.length > 0
              ? changes.join(". ")
              : "La suscripción fue guardada sin cambios.",
          metadata: {
            clientId,
            projectId,
            planId,
            status,
            billingCycle,
            agreedPrice,
            requestsUsed,
            startsAt:
              startsAt.toISOString(),
            renewsAt:
              renewsAt?.toISOString() ??
              null,
            endsAt:
              endsAt?.toISOString() ??
              null,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/planes");
  revalidatePath("/suscripciones");
  revalidatePath(
    `/suscripciones/${subscriptionId}/editar`,
  );
  revalidatePath(
    `/clientes/${clientId}`,
  );

  if (
    existingSubscription.clientId !==
    clientId
  ) {
    revalidatePath(
      `/clientes/${existingSubscription.clientId}`,
    );
  }

  redirect(
    `/suscripciones/${subscriptionId}/editar?resultado=actualizada`,
  );
}

export async function createRenewalFromSubscription(
  subscriptionId: string,
  formData: FormData,
) {
  const confirmed =
    formData.get("confirmation") ===
    "on";

  if (!confirmed) {
    throw new Error(
      "Debes confirmar la creación de la renovación.",
    );
  }

  const subscription =
    await prisma.subscription.findUnique({
      where: {
        id: subscriptionId,
      },
      include: {
        client: true,
        project: true,
        plan: true,
      },
    });

  if (!subscription) {
    throw new Error(
      "La suscripción seleccionada no existe.",
    );
  }

  if (
    subscription.status ===
      "CANCELLED" ||
    subscription.status ===
      "EXPIRED"
  ) {
    throw new Error(
      "No se puede crear una renovación desde una suscripción cancelada o vencida.",
    );
  }

  const dueDate = parseRequiredDate(
    formData,
    "dueDate",
    "La fecha de vencimiento",
  );

  const netAmount = parseAmount(
    formData,
    "netAmount",
    "El monto neto",
  );

  const vatAmount = Math.round(
    netAmount * 0.19,
  );

  const totalWithVat =
    netAmount + vatAmount;

  const dueDateStart =
    new Date(dueDate);

  dueDateStart.setHours(
    0,
    0,
    0,
    0,
  );

  const dueDateEnd =
    new Date(dueDate);

  dueDateEnd.setHours(
    23,
    59,
    59,
    999,
  );

  const existingRenewal =
    await prisma.renewal.findFirst({
      where: {
        subscriptionId:
          subscription.id,
        type: "SUBSCRIPTION",
        dueDate: {
          gte: dueDateStart,
          lte: dueDateEnd,
        },
        status: {
          not: "CANCELLED",
        },
      },
      select: {
        id: true,
      },
    });

  if (existingRenewal) {
    redirect(
      `/suscripciones/${subscription.id}/editar?error=renovacion-duplicada`,
    );
  }

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  const renewalStatus =
    dueDate < today
      ? "EXPIRED"
      : "UPCOMING";

  const projectReference =
    subscription.project?.domain ??
    subscription.project?.name ??
    subscription.client.businessName;

  const description =
    `Renovación de suscripción ${subscription.plan.name} · ${projectReference}`;

  const renewal =
    await prisma.$transaction(
      async (transaction) => {
        const createdRenewal =
          await transaction.renewal.create({
            data: {
              clientId:
                subscription.clientId,
              projectId:
                subscription.projectId,
              subscriptionId:
                subscription.id,
              type: "SUBSCRIPTION",
              description,
              dueDate,
              amount: totalWithVat,
              status: renewalStatus,
              notes: [
                `Renovación creada desde la suscripción ${subscription.id}.`,
                `Plan: ${subscription.plan.name}.`,
                `Ciclo: ${getBillingCycleLabel(
                  subscription.billingCycle,
                )}.`,
                `Monto neto: ${netAmount}.`,
                `IVA 19%: ${vatAmount}.`,
                `Total con IVA: ${totalWithVat}.`,
                subscription.notes
                  ? `Notas de la suscripción: ${subscription.notes}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          });

        await transaction.activityLog.create({
          data: {
            clientId:
              subscription.clientId,
            projectId:
              subscription.projectId,
            action:
              "SUBSCRIPTION_RENEWAL_CREATED",
            entityType: "Renewal",
            entityId:
              createdRenewal.id,
            description: `Se creó una renovación desde la suscripción de ${subscription.client.businessName} al plan ${subscription.plan.name}.`,
            metadata: {
              subscriptionId:
                subscription.id,
              renewalId:
                createdRenewal.id,
              planId:
                subscription.planId,
              billingCycle:
                subscription.billingCycle,
              dueDate:
                dueDate.toISOString(),
              netAmount,
              vatAmount,
              totalWithVat,
              status:
                renewalStatus,
            },
          },
        });

        return createdRenewal;
      },
    );

  revalidatePath("/");
  revalidatePath("/renovaciones");
  revalidatePath("/suscripciones");
  revalidatePath(
    `/suscripciones/${subscription.id}/editar`,
  );
  revalidatePath(
    `/clientes/${subscription.clientId}`,
  );

  redirect(
    `/suscripciones/${subscription.id}/editar?resultado=renovacion-creada&renovacion=${renewal.id}`,
  );
}