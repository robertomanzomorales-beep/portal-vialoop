"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type SupportPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "URGENT";

type SupportStatus =
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "WAITING_FOR_CLIENT"
  | "APPROVED"
  | "IN_PROGRESS"
  | "READY_FOR_REVIEW"
  | "COMPLETED"
  | "REJECTED"
  | "OUT_OF_SCOPE";

const allowedPriorities: SupportPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

const allowedStatuses: SupportStatus[] = [
  "RECEIVED",
  "UNDER_REVIEW",
  "WAITING_FOR_CLIENT",
  "APPROVED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "REJECTED",
  "OUT_OF_SCOPE",
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

function parseOptionalDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha ingresada no es válida.");
  }

  return date;
}

function getPriority(formData: FormData): SupportPriority {
  const value = getRequiredString(
    formData,
    "priority",
    "La prioridad",
  );

  if (!allowedPriorities.includes(value as SupportPriority)) {
    throw new Error(
      "La prioridad seleccionada no es válida.",
    );
  }

  return value as SupportPriority;
}

function getStatus(formData: FormData): SupportStatus {
  const value = getRequiredString(
    formData,
    "status",
    "El estado",
  );

  if (!allowedStatuses.includes(value as SupportStatus)) {
    throw new Error(
      "El estado seleccionado no es válido.",
    );
  }

  return value as SupportStatus;
}

export async function createSupportRequest(
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

  const subject = getRequiredString(
    formData,
    "subject",
    "El asunto",
  );

  const description = getRequiredString(
    formData,
    "description",
    "La descripción",
  );

  const priority = getPriority(formData);

  const estimatedDelivery = parseOptionalDate(
    getOptionalString(formData, "estimatedDelivery"),
  );

  const internalNotes = getOptionalString(
    formData,
    "internalNotes",
  );

  const client = await prisma.client.findUnique({
    where: {
      id: clientId,
    },
    select: {
      id: true,
    },
  });

  if (!client) {
    throw new Error(
      "El cliente seleccionado no existe.",
    );
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        clientId: true,
      },
    });

    if (!project) {
      throw new Error(
        "El proyecto seleccionado no existe.",
      );
    }

    if (project.clientId !== clientId) {
      throw new Error(
        "El proyecto seleccionado no pertenece al cliente indicado.",
      );
    }
  }

  const request = await prisma.supportRequest.create({
    data: {
      clientId,
      projectId,
      subject,
      description,
      priority,
      status: "RECEIVED",
      estimatedDelivery,
      internalNotes,
    },
  });

  revalidatePath("/");
  revalidatePath("/solicitudes");
  revalidatePath(`/clientes/${clientId}`);

  redirect(
    `/solicitudes/${request.id}?resultado=creada`,
  );
}

export async function updateSupportRequest(
  requestId: string,
  formData: FormData,
) {
  const existingRequest =
    await prisma.supportRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        clientId: true,
      },
    });

  if (!existingRequest) {
    throw new Error(
      "La solicitud seleccionada no existe.",
    );
  }

  const status = getStatus(formData);
  const priority = getPriority(formData);

  const estimatedDelivery = parseOptionalDate(
    getOptionalString(formData, "estimatedDelivery"),
  );

  const internalNotes = getOptionalString(
    formData,
    "internalNotes",
  );

  await prisma.supportRequest.update({
    where: {
      id: requestId,
    },
    data: {
      status,
      priority,
      estimatedDelivery,
      internalNotes,
    },
  });

  revalidatePath("/");
  revalidatePath("/solicitudes");
  revalidatePath(`/solicitudes/${requestId}`);
  revalidatePath(
    `/clientes/${existingRequest.clientId}`,
  );

  redirect(
    `/solicitudes/${requestId}?resultado=actualizada`,
  );
}