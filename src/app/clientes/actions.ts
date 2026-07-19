"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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
  if (email && !email.includes("@")) {
    throw new Error("El correo ingresado no es válido.");
  }
}

export async function createClient(formData: FormData) {
  const businessName = getRequiredString(formData, "businessName");
  const email = getOptionalString(formData, "email");
  const rut = getOptionalString(formData, "rut");

  validateEmail(email);

  await prisma.client.create({
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

  redirect("/clientes");
}

export async function updateClient(
  clientId: string,
  formData: FormData,
) {
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