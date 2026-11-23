"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import {
  buildClientWelcomeEmail,
  DORIS_EMAIL,
} from "@/lib/client-welcome-email";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export type WelcomeEmailActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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

export async function createClient(formData: FormData) {
  await requireUser();

  const businessName = getRequiredString(formData, "businessName");
  const email = getOptionalString(formData, "email");
  const rut = getOptionalString(formData, "rut");

  validateEmail(email);

  const client = await prisma.client.create({
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

  revalidatePath("/");
  revalidatePath("/clientes");

  const nextAction = getOptionalString(formData, "nextAction");

  if (nextAction === "welcome") {
    redirect(`/clientes/${client.id}?bienvenida=preparar`);
  }

  redirect(`/clientes/${client.id}`);
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

    revalidatePath(`/clientes/${client.id}`);

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
  await requireUser();

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
