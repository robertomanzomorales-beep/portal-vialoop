"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import {
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import {
  buildClientOperationTasks,
  getLatestClientOperationTasks,
} from "@/lib/client-operation";
import {
  buildClientWelcomeEmail,
  DORIS_EMAIL,
} from "@/lib/client-welcome-email";
import { hasHostingAccessData } from "@/lib/hosting-access";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import {
  clientOperationServiceTypes,
  parseScheduledTaskMetadata,
  type ClientOperationServiceType,
} from "@/lib/scheduled-task";

export type WelcomeEmailActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ClientOperationActionState = {
  ok: boolean;
  message: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function getRequiredString(formData: FormData, field: string) {
  const value = getOptionalString(formData, field);

  if (!value) {
    throw new Error(`El campo ${field} es obligatorio.`);
  }

  return value;
}

function getOptionalDate(formData: FormData, field: string) {
  const value = getOptionalString(formData, field);

  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`La fecha ingresada en ${field} no es válida.`);
  }

  return date;
}

function getOptionalAmount(formData: FormData, field: string) {
  const value = getOptionalString(formData, field);

  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/[^\d.-]/g, "");
  const amount = Number(normalizedValue);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("El monto ingresado no es válido.");
  }

  return amount;
}

function validateEmail(email: string | null) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email && !emailPattern.test(email)) {
    throw new Error("El correo ingresado no es válido.");
  }
}

function chileDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function validDateKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

async function getClientOperationInput(
  formData: FormData,
  fallbackResponsible: { id: string; name: string },
) {
  const serviceTypeValue = getRequiredString(formData, "serviceType");

  if (
    !clientOperationServiceTypes.includes(
      serviceTypeValue as ClientOperationServiceType,
    )
  ) {
    throw new Error("Selecciona un tipo de servicio válido.");
  }

  const serviceName = getRequiredString(formData, "serviceName");
  const targetDate = validDateKey(
    getRequiredString(formData, "operationTargetDate"),
  );
  const responsibleUserId =
    getOptionalString(formData, "responsibleUserId") ??
    fallbackResponsible.id;

  if (!targetDate || targetDate < chileDateKey()) {
    throw new Error("La fecha objetivo debe ser válida y no puede estar vencida.");
  }

  if (serviceName.length > 160) {
    throw new Error("El nombre del servicio no puede superar 160 caracteres.");
  }

  const responsible = await prisma.user.findFirst({
    where: {
      id: responsibleUserId,
      active: true,
      role: { in: ["ADMIN", "COLLABORATOR"] },
    },
    select: { id: true, name: true },
  });

  return {
    serviceType: serviceTypeValue as ClientOperationServiceType,
    serviceName,
    targetDate,
    responsible: responsible ?? fallbackResponsible,
  };
}

export async function createClient(formData: FormData) {
  const user = await requireUser();

  const businessName = getRequiredString(formData, "businessName");
  const email = getOptionalString(formData, "email");
  const rut = getOptionalString(formData, "rut");

  validateEmail(email);

  const operation = await getClientOperationInput(formData, {
    id: user.id,
    name: user.name,
  });
  const startDate = chileDateKey();
  const updatedAt = new Date().toISOString();

  const client = await prisma.$transaction(async (transaction) => {
    const createdClient = await transaction.client.create({
      data: {
        businessName,
        tradeName: getOptionalString(formData, "tradeName"),
        rut,
        mainContactName: getOptionalString(formData, "mainContactName"),
        email,
        phone: getOptionalString(formData, "phone"),
        city: getOptionalString(formData, "city"),
        address: getOptionalString(formData, "address"),
        internalNotes: getOptionalString(formData, "internalNotes"),
        status: "ACTIVE",
      },
    });
    const clientName = createdClient.tradeName || createdClient.businessName;
    const tasks = buildClientOperationTasks({
      workflowId: randomUUID(),
      clientId: createdClient.id,
      clientName,
      serviceType: operation.serviceType,
      serviceName: operation.serviceName,
      responsible: operation.responsible.name,
      startDate,
      targetDate: operation.targetDate,
      updatedAt,
    });

    await transaction.activityLog.createMany({
      data: tasks.map((task) => ({
        userId: user.id,
        clientId: createdClient.id,
        action: "CLIENT_OPERATION_STEP_CREATED",
        entityType: "ScheduledTask",
        entityId: task.title,
        description: `${task.title} incorporado al flujo de ${operation.serviceName}.`,
        metadata: json(task),
      })),
    });

    return createdClient;
  });

  revalidatePath("/");
  revalidatePath("/clientes");

  const nextAction = getOptionalString(formData, "nextAction");

  if (nextAction === "welcome") {
    redirect(`/clientes/${client.id}?bienvenida=preparar`);
  }

  redirect(`/clientes/${client.id}`);
}

async function getClientOperationRecords(clientId: string) {
  const logs = await prisma.activityLog.findMany({
    where: {
      clientId,
      entityType: "ScheduledTask",
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      createdAt: true,
      metadata: true,
    },
  });

  return logs.flatMap((log) => {
    const metadata = parseScheduledTaskMetadata(log.metadata);

    return metadata?.workflow?.type === "CLIENT_ONBOARDING"
      ? [
          {
            id: log.id,
            createdAt: log.createdAt.toISOString(),
            metadata,
          },
        ]
      : [];
  });
}

export async function startClientOperation(
  clientId: string,
  _previousState: ClientOperationActionState,
  formData: FormData,
): Promise<ClientOperationActionState> {
  const user = await requireUser();

  try {
    const [client, existingRecords] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          businessName: true,
          tradeName: true,
          status: true,
        },
      }),
      getClientOperationRecords(clientId),
    ]);

    if (!client || client.status !== "ACTIVE") {
      return {
        ok: false,
        message: "El cliente no existe o no está activo.",
      };
    }

    const latestOperation = getLatestClientOperationTasks(existingRecords);
    const hasOpenOperation = latestOperation.some(
      (record) => record.metadata.status !== "COMPLETED",
    );

    if (hasOpenOperation) {
      return {
        ok: false,
        message:
          "Este cliente ya tiene un flujo operativo activo. Actualiza sus etapas antes de iniciar otro.",
      };
    }

    const operation = await getClientOperationInput(formData, {
      id: user.id,
      name: user.name,
    });
    const startDate = chileDateKey();
    const tasks = buildClientOperationTasks({
      workflowId: randomUUID(),
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      serviceType: operation.serviceType,
      serviceName: operation.serviceName,
      responsible: operation.responsible.name,
      startDate,
      targetDate: operation.targetDate,
      updatedAt: new Date().toISOString(),
    });

    await prisma.activityLog.createMany({
      data: tasks.map((task) => ({
        userId: user.id,
        clientId: client.id,
        action: "CLIENT_OPERATION_STEP_CREATED",
        entityType: "ScheduledTask",
        entityId: task.title,
        description: `${task.title} incorporado al flujo de ${operation.serviceName}.`,
        metadata: json(task),
      })),
    });

    revalidatePath("/");
    revalidatePath(`/clientes/${client.id}`);
    revalidatePath("/planificacion");
    revalidatePath("/seguimiento");

    return {
      ok: true,
      message: `Flujo operativo de ${operation.serviceName} creado correctamente.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible iniciar el flujo operativo.",
    };
  }
}

async function completeClientOperationStep(
  clientId: string,
  stepId: string,
  userId: string,
) {
  const records = getLatestClientOperationTasks(
    await getClientOperationRecords(clientId),
  );
  const record = records.find(
    (item) => item.metadata.workflow?.stepId === stepId,
  );

  if (!record || record.metadata.status === "COMPLETED") {
    return;
  }

  await prisma.activityLog.update({
    where: { id: record.id },
    data: {
      userId,
      action: "CLIENT_OPERATION_STEP_COMPLETED",
      description: `${record.metadata.title} completado automáticamente.`,
      metadata: json({
        ...record.metadata,
        status: "COMPLETED",
        updatedAt: new Date().toISOString(),
      }),
    },
  });

  const firstOpenTask = records
    .map((item) =>
      item.id === record.id
        ? {
            ...item,
            metadata: {
              ...item.metadata,
              status: "COMPLETED" as const,
            },
          }
        : item,
    )
    .find((item) => item.metadata.status !== "COMPLETED");

  if (firstOpenTask?.metadata.status === "PENDING") {
    await prisma.activityLog.update({
      where: { id: firstOpenTask.id },
      data: {
        userId,
        action: "CLIENT_OPERATION_STEP_STARTED",
        description: `${firstOpenTask.metadata.title} iniciado automáticamente.`,
        metadata: json({
          ...firstOpenTask.metadata,
          status: "IN_PROGRESS",
          updatedAt: new Date().toISOString(),
        }),
      },
    });
  }
}

function getWelcomeEmailInteger(
  formData: FormData,
  field: string,
) {
  const rawValue = getOptionalString(formData, field) ?? "0";
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0 || value > 500) {
    throw new Error(`El valor de ${field} no es válido.`);
  }

  return value;
}

function getWelcomeEmailRequirements(formData: FormData) {
  const value = getRequiredString(formData, "requirements");

  if (value.length > 5000) {
    throw new Error("La lista de materiales requeridos es demasiado extensa.");
  }

  const requirements = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 15);

  if (requirements.length === 0) {
    throw new Error("Debes indicar al menos un material requerido.");
  }

  return requirements;
}

function actionError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No fue posible enviar el correo de bienvenida.";
}

export async function sendClientWelcomeEmail(
  clientId: string,
  _previousState: WelcomeEmailActionState,
  formData: FormData,
): Promise<WelcomeEmailActionState> {
  const user = await requireUser();

  try {
    const client = await prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        mainContactName: true,
        email: true,
      },
    });

    if (!client) {
      return {
        status: "error",
        message: "El cliente ya no existe o no está disponible.",
      };
    }

    const recipient = getRequiredString(formData, "recipient").toLowerCase();
    const subject = getRequiredString(formData, "subject");
    const productName = getRequiredString(formData, "productName");
    const welcomeMessage = getRequiredString(formData, "welcomeMessage");
    const additionalNotes = getOptionalString(formData, "additionalNotes") ?? "";
    const photoCount = getWelcomeEmailInteger(formData, "photoCount");
    const fileCount = getWelcomeEmailInteger(formData, "fileCount");
    const requirements = getWelcomeEmailRequirements(formData);

    validateEmail(recipient);

    if (subject.length > 180) {
      return {
        status: "error",
        message: "El asunto no puede superar los 180 caracteres.",
      };
    }

    if (
      productName.length > 160 ||
      welcomeMessage.length > 3000 ||
      additionalNotes.length > 3000
    ) {
      return {
        status: "error",
        message: "El producto o el mensaje de bienvenida es demasiado extenso.",
      };
    }

    const email = buildClientWelcomeEmail({
      clientName: client.tradeName || client.businessName,
      contactName:
        getOptionalString(formData, "contactName") ??
        client.mainContactName ??
        "",
      subject,
      productName,
      welcomeMessage,
      photoCount,
      fileCount,
      requirements,
      additionalNotes,
    });

    const mailResult = await sendEmail({
      to: recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromEmail: DORIS_EMAIL,
      fromName: "Doris Loayza G. · Vialoop",
      replyTo: DORIS_EMAIL,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        clientId: client.id,
        action: "CLIENT_WELCOME_EMAIL_SENT",
        entityType: "ClientWelcomeEmail",
        entityId: client.id,
        description: `Correo de bienvenida enviado por Doris a ${recipient}.`,
        metadata: {
          recipient,
          subject,
          productName,
          photoCount,
          fileCount,
          smtpMessageId: mailResult.messageId,
          accepted: mailResult.accepted,
          rejected: mailResult.rejected,
        },
      },
    });

    await completeClientOperationStep(
      client.id,
      "WELCOME_EMAIL",
      user.id,
    );

    revalidatePath(`/clientes/${client.id}`);
    revalidatePath("/");
    revalidatePath("/planificacion");
    revalidatePath("/seguimiento");

    return {
      status: "success",
      message: `Bienvenida enviada correctamente a ${recipient}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError(error),
    };
  }
}

export async function updateClient(
  clientId: string,
  formData: FormData,
) {
  const user = await requireUser();

  const businessName = getRequiredString(formData, "businessName");
  const email = getOptionalString(formData, "email");
  const rut = getOptionalString(formData, "rut");

  validateEmail(email);

  const clientStatus =
    getOptionalString(formData, "clientStatus") ?? "ACTIVE";

  const projectId = getOptionalString(formData, "projectId");
  const renewalId = getOptionalString(formData, "renewalId");

  const projectName =
    getOptionalString(formData, "projectName") ??
    getOptionalString(formData, "domain") ??
    `${businessName} - Sitio web`;

  const domain = getOptionalString(formData, "domain");
  const websiteUrl =
    getOptionalString(formData, "websiteUrl") ??
    (domain ? `https://${domain}` : null);

  const hostingRenewalDate = getOptionalDate(
    formData,
    "hostingRenewalDate",
  );

  const domainRenewalDate = getOptionalDate(
    formData,
    "domainRenewalDate",
  );

  const renewalDueDate = getOptionalDate(
    formData,
    "renewalDueDate",
  );

  const renewalAmount = getOptionalAmount(
    formData,
    "renewalAmount",
  );
  const hostingAccess = {
    panelUrl: getOptionalString(formData, "hostingPanelUrl") ?? "",
    username: getOptionalString(formData, "hostingUsername") ?? "",
    accountReference:
      getOptionalString(formData, "hostingAccountReference") ?? "",
    recoveryEmail:
      getOptionalString(formData, "hostingRecoveryEmail") ?? "",
    credentialReference:
      getOptionalString(formData, "hostingCredentialReference") ?? "",
    notes: getOptionalString(formData, "hostingAccessNotes") ?? "",
  };
  const hasExistingHostingAccess =
    getOptionalString(formData, "hostingAccessRecord") === "1";
  const hasHostingAccessInformation = hasHostingAccessData(hostingAccess);

  validateEmail(hostingAccess.recoveryEmail || null);

  if (hostingAccess.panelUrl) {
    try {
      const panelUrl = new URL(hostingAccess.panelUrl);

      if (!["http:", "https:"].includes(panelUrl.protocol)) {
        throw new Error();
      }
    } catch {
      throw new Error("La URL del panel de hosting no es válida.");
    }
  }

  const projectData = {
    name: projectName,
    domain,
    websiteUrl,
    websiteType: getOptionalString(formData, "websiteType"),
    technology: getOptionalString(formData, "technology"),
    hostingProvider: getOptionalString(
      formData,
      "hostingProvider",
    ),
    hostingCapacity: getOptionalString(
      formData,
      "hostingCapacity",
    ),
    hostingRenewalDate,
    domainRenewalDate,
    formRecipientEmail: getOptionalString(
      formData,
      "formRecipientEmail",
    ),
    status:
      getOptionalString(formData, "projectStatus") ?? "ACTIVE",
    notes: getOptionalString(formData, "projectNotes"),
  };

  await prisma.$transaction(async (transaction) => {
    await transaction.client.update({
      where: {
        id: clientId,
      },
      data: {
        businessName,
        tradeName: getOptionalString(formData, "tradeName"),
        rut,
        mainContactName: getOptionalString(
          formData,
          "mainContactName",
        ),
        email,
        phone: getOptionalString(formData, "phone"),
        city: getOptionalString(formData, "city"),
        address: getOptionalString(formData, "address"),
        internalNotes: getOptionalString(
          formData,
          "internalNotes",
        ),
        status: clientStatus as
          | "ACTIVE"
          | "SUSPENDED"
          | "FINISHED",
      },
    });

    let savedProjectId = projectId;

    const hasProjectInformation =
      Boolean(projectId) ||
      Boolean(domain) ||
      Boolean(websiteUrl) ||
      Boolean(hostingRenewalDate) ||
      Boolean(domainRenewalDate) ||
      hasHostingAccessInformation ||
      Boolean(getOptionalString(formData, "hostingCapacity")) ||
      Boolean(getOptionalString(formData, "hostingProvider"));

    if (hasProjectInformation) {
      if (projectId) {
        await transaction.project.update({
          where: {
            id: projectId,
          },
          data: {
            ...projectData,
            status: projectData.status as
              | "DEVELOPMENT"
              | "ACTIVE"
              | "MAINTENANCE"
              | "SUSPENDED"
              | "FINISHED",
          },
        });
      } else {
        const createdProject = await transaction.project.create({
          data: {
            clientId,
            ...projectData,
            status: projectData.status as
              | "DEVELOPMENT"
              | "ACTIVE"
              | "MAINTENANCE"
              | "SUSPENDED"
              | "FINISHED",
          },
        });

        savedProjectId = createdProject.id;
      }
    }

    if (
      savedProjectId &&
      (hasHostingAccessInformation || hasExistingHostingAccess)
    ) {
      await transaction.activityLog.create({
        data: {
          userId: user.id,
          clientId,
          projectId: savedProjectId,
          action: "HOSTING_ACCESS_UPDATED",
          entityType: "HostingAccess",
          entityId: savedProjectId,
          description: hasHostingAccessInformation
            ? "Datos de acceso técnico del hosting actualizados."
            : "Datos de acceso técnico del hosting limpiados.",
          metadata: json({
            ...hostingAccess,
            updatedAt: new Date().toISOString(),
            updatedBy: user.name,
          }),
        },
      });
    }

    const hasRenewalInformation =
      Boolean(renewalId) ||
      Boolean(renewalDueDate) ||
      renewalAmount !== null;

    if (hasRenewalInformation && renewalDueDate) {
      const renewalData = {
        clientId,
        projectId: savedProjectId,
        type:
          (getOptionalString(formData, "renewalType") ??
            "HOSTING") as
            | "DOMAIN"
            | "HOSTING"
            | "EMAIL"
            | "SSL"
            | "SUBSCRIPTION"
            | "ADDITIONAL_SERVICE",
        description:
          getOptionalString(formData, "renewalDescription") ??
          "Renovación de hosting",
        dueDate: renewalDueDate,
        amount: renewalAmount,
        status:
          (getOptionalString(formData, "renewalStatus") ??
            "UPCOMING") as
            | "UPCOMING"
            | "NOTIFIED"
            | "PAID"
            | "RENEWED"
            | "EXPIRED"
            | "CANCELLED",
        notes: getOptionalString(formData, "renewalNotes"),
      };

      if (renewalId) {
        await transaction.renewal.update({
          where: {
            id: renewalId,
          },
          data: renewalData,
        });
      } else {
        await transaction.renewal.create({
          data: renewalData,
        });
      }
    }
  });

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath(`/clientes/${clientId}/editar`);
  revalidatePath("/renovaciones");
  revalidatePath("/seguimiento");

  redirect(`/clientes/${clientId}`);
}

export async function deleteClient(
  clientId: string,
) {
  await requireAdmin();

  const client =
    await prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
        businessName: true,
      },
    });

  if (!client) {
    redirect("/clientes?resultado=no-encontrado");
  }

  await prisma.$transaction(
    async (transaction) => {
      /*
       * Sale protege la relación con el cliente mediante
       * Restrict. Sus dependencias financieras usan Cascade,
       * por lo que se eliminan primero de forma explícita.
       */
      await transaction.sale.deleteMany({
        where: {
          clientId,
        },
      });

      await transaction.client.delete({
        where: {
          id: clientId,
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  revalidatePath("/pagos");
  revalidatePath("/renovaciones");

  redirect(
    `/clientes?resultado=eliminado&cliente=${encodeURIComponent(
      client.businessName,
    )}`,
  );
}
