"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function generatePaymentFromRenewal(
  renewalId: string,
) {
  const renewal = await prisma.renewal.findUnique({
    where: {
      id: renewalId,
    },
    include: {
      client: true,
      project: true,
    },
  });

  if (!renewal) {
    throw new Error("La renovación seleccionada no existe.");
  }

  if (renewal.amount === null) {
    throw new Error(
      "La renovación no tiene un monto registrado. Debes editarla antes de generar el cobro.",
    );
  }

  if (
    renewal.status === "PAID" ||
    renewal.status === "RENEWED" ||
    renewal.status === "CANCELLED"
  ) {
    throw new Error(
      "No se puede generar un cobro para una renovación cerrada.",
    );
  }

  const reference = `renewal:${renewal.id}`;

  const existingPayment = await prisma.payment.findFirst({
    where: {
      clientId: renewal.clientId,
      reference,
      status: {
        in: ["PENDING", "OVERDUE", "PAID"],
      },
    },
  });

  if (existingPayment) {
    redirect("/pagos?resultado=existente");
  }

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        clientId: renewal.clientId,
        subscriptionId: renewal.subscriptionId,
        description: renewal.description,
        amount: renewal.amount,
        dueDate: renewal.dueDate,
        status:
          renewal.dueDate < new Date() ? "OVERDUE" : "PENDING",
        reference,
        notes: [
          `Cobro generado desde la renovación ${renewal.id}.`,
          renewal.project?.domain
            ? `Dominio: ${renewal.project.domain}.`
            : null,
          renewal.notes,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    }),

    prisma.renewal.update({
      where: {
        id: renewal.id,
      },
      data: {
        status: "NOTIFIED",
        notifiedAt: new Date(),
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/renovaciones");
  revalidatePath("/pagos");
  revalidatePath(`/clientes/${renewal.clientId}`);

  redirect("/pagos?resultado=creado");
}