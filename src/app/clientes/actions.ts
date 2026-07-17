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

export async function createClient(formData: FormData) {
  const businessName = getOptionalString(formData, "businessName");
  const email = getOptionalString(formData, "email");
  const rut = getOptionalString(formData, "rut");

  if (!businessName) {
    throw new Error("La razón social es obligatoria.");
  }

  if (email && !email.includes("@")) {
    throw new Error("El correo ingresado no es válido.");
  }

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