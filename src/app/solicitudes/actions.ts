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

function getPriority(
  formData: FormData,
): SupportPriority {
  const value = getRequiredString(
    formData,
    "priority",
    "La prioridad",
  );

  if (
    !allowedPriorities.includes(
      value as SupportPriority,
    )
  ) {
    throw new Error(
      "La prioridad seleccionada no es válida.",
    );
  }

  return value as SupportPriority;
}

function getStatus(
  formData: FormData,
): SupportStatus {
  const value = getRequiredString(
    formData,
    "status",
    "El estado",
  );

  if (
    !allowedStatuses.includes(
      value as SupportStatus,
    )
  ) {
    throw new Error(
      "El estado seleccionado no es válido.",
    );
  }

  return value as SupportStatus;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    RECEIVED: "Recibida",
    UNDER_REVIEW: "En revisión",
    WAITING_FOR_CLIENT: "Esperando cliente",
    APPROVED: "Aprobada",
    IN_PROGRESS: "En proceso",
    READY_FOR_REVIEW: "Lista para revisión",
    COMPLETED: "Completada",
    REJECTED: "Rechazada",
    OUT_OF_SCOPE: "Fuera de alcance",
  };

  return labels[status] ?? status;
}

function getPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Baja",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority] ?? priority;
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
    getOptionalString(
      formData,
      "estimatedDelivery",
    ),
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
      businessName: true,
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

  const request = await prisma.$transaction(
    async (transaction) => {
      const createdRequest =
        await transaction.supportRequest.create({
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

      await transaction.activityLog.create({
        data: {
          clientId,
          projectId,
          supportRequestId: createdRequest.id,
          action: "SUPPORT_REQUEST_CREATED",
          entityType: "SupportRequest",
          entityId: createdRequest.id,
          description: `Solicitud #${createdRequest.number
            .toString()
            .padStart(4, "0")} creada para ${client.businessName}.`,
          metadata: {
            subject,
            priority,
            status: "RECEIVED",
          },
        },
      });

      return createdRequest;
    },
  );

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
        number: true,
        clientId: true,
        projectId: true,
        status: true,
        priority: true,
        assignedToId: true,
        estimatedDelivery: true,
        completedAt: true,
        internalNotes: true,
        assignedTo: {
          select: {
            name: true,
          },
        },
      },
    });

  if (!existingRequest) {
    throw new Error(
      "La solicitud seleccionada no existe.",
    );
  }

  const status = getStatus(formData);
  const priority = getPriority(formData);

  const clientId = getOptionalString(
    formData,
    "clientId",
  );

  const projectId = getOptionalString(
    formData,
    "projectId",
  );

  const assignedToId = getOptionalString(
    formData,
    "assignedToId",
  );

  const estimatedDelivery = parseOptionalDate(
    getOptionalString(
      formData,
      "estimatedDelivery",
    ),
  );

  const internalNotes = getOptionalString(
    formData,
    "internalNotes",
  );

  let assignedUser:
    | {
        id: string;
        name: string;
      }
    | null = null;

  if (assignedToId) {
    assignedUser = await prisma.user.findFirst({
      where: {
        id: assignedToId,
        active: true,
        role: {
          in: ["ADMIN", "COLLABORATOR"],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!assignedUser) {
      throw new Error(
        "El responsable seleccionado no existe o no está activo.",
      );
    }
  }

  if (clientId) {
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

    if (!clientId || project.clientId !== clientId) {
      throw new Error(
        "El proyecto seleccionado no pertenece al cliente indicado.",
      );
    }
  }

  const completedAt =
    status === "COMPLETED"
      ? existingRequest.completedAt ?? new Date()
      : null;

  const changes: string[] = [];

  if (existingRequest.status !== status) {
    changes.push(
      `Estado: ${getStatusLabel(
        existingRequest.status,
      )} → ${getStatusLabel(status)}`,
    );
  }

  if (existingRequest.clientId !== clientId) {
    changes.push("Cliente asociado actualizado");
  }

  if (existingRequest.projectId !== projectId) {
    changes.push("Proyecto asociado actualizado");
  }

  if (existingRequest.priority !== priority) {
    changes.push(
      `Prioridad: ${getPriorityLabel(
        existingRequest.priority,
      )} → ${getPriorityLabel(priority)}`,
    );
  }

  if (
    existingRequest.assignedToId !== assignedToId
  ) {
    changes.push(
      `Responsable: ${
        existingRequest.assignedTo?.name ??
        "Sin asignar"
      } → ${assignedUser?.name ?? "Sin asignar"}`,
    );
  }

  const previousDate =
    existingRequest.estimatedDelivery?.toISOString() ??
    null;

  const nextDate =
    estimatedDelivery?.toISOString() ?? null;

  if (previousDate !== nextDate) {
    changes.push("Fecha estimada actualizada");
  }

  if (
    existingRequest.internalNotes !== internalNotes
  ) {
    changes.push("Notas internas actualizadas");
  }

  const description =
    changes.length > 0
      ? changes.join(". ")
      : "La solicitud fue guardada sin cambios operativos.";

  await prisma.$transaction(
    async (transaction) => {
      await transaction.supportRequest.update({
        where: {
          id: requestId,
        },
        data: {
          clientId,
          projectId,
          status,
          priority,
          assignedToId,
          estimatedDelivery,
          internalNotes,
          completedAt,
        },
      });

      await transaction.activityLog.create({
        data: {
          clientId,
          projectId,
          supportRequestId: requestId,
          action: "SUPPORT_REQUEST_UPDATED",
          entityType: "SupportRequest",
          entityId: requestId,
          description,
          metadata: {
            previousStatus: existingRequest.status,
            status,
            previousClientId: existingRequest.clientId,
            clientId,
            previousProjectId: existingRequest.projectId,
            projectId,
            previousPriority:
              existingRequest.priority,
            priority,
            previousAssignedToId:
              existingRequest.assignedToId,
            assignedToId,
            previousEstimatedDelivery:
              previousDate,
            estimatedDelivery: nextDate,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/solicitudes");
  revalidatePath(`/solicitudes/${requestId}`);

  if (existingRequest.clientId) {
    revalidatePath(
      `/clientes/${existingRequest.clientId}`,
    );
  }


  if (
    clientId &&
    clientId !== existingRequest.clientId
  ) {
    revalidatePath(`/clientes/${clientId}`);
  }

  redirect(
    `/solicitudes/${requestId}?resultado=actualizada`,
  );
}

export async function addSupportComment(
  requestId: string,
  formData: FormData,
) {
  const message = getRequiredString(
    formData,
    "message",
    "El comentario",
  );

  const authorName =
    getOptionalString(formData, "authorName") ??
    "Roberto Manzo";

  const internal =
    formData.get("internal") === "on";

  const request =
    await prisma.supportRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        clientId: true,
        projectId: true,
      },
    });

  if (!request) {
    throw new Error(
      "La solicitud seleccionada no existe.",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      await transaction.supportComment.create({
        data: {
          supportRequestId: requestId,
          authorName,
          authorType: "ADMIN",
          message,
          internal,
        },
      });

      await transaction.activityLog.create({
        data: {
          clientId: request.clientId,
          projectId: request.projectId,
          supportRequestId: requestId,
          action: "SUPPORT_COMMENT_CREATED",
          entityType: "SupportComment",
          description: internal
            ? `${authorName} agregó un comentario interno.`
            : `${authorName} agregó un comentario visible.`,
          metadata: {
            authorName,
            internal,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/solicitudes");
  revalidatePath(`/solicitudes/${requestId}`);

  if (request.clientId) {
    revalidatePath(`/clientes/${request.clientId}`);
  }

  redirect(
    `/solicitudes/${requestId}?resultado=comentario`,
  );
}
