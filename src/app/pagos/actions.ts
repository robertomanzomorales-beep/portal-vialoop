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

export async function markPaymentAsPaid(
  paymentId: string,
  formData: FormData,
) {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },
  });

  if (!payment) {
    throw new Error("El pago seleccionado no existe.");
  }

  if (payment.status === "PAID") {
    redirect("/pagos?resultado=pagado");
  }

  const paymentMethod =
    getOptionalString(formData, "paymentMethod") ??
    "BANK_TRANSFER";

  const paymentReference =
    getOptionalString(formData, "paymentReference") ??
    payment.reference;

  await prisma.$transaction(async (transaction) => {
    await transaction.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "PAID",
        paidAt: new Date(),
        method: paymentMethod as
          | "BANK_TRANSFER"
          | "CREDIT_CARD"
          | "DEBIT_CARD"
          | "CASH"
          | "OTHER",
        reference: paymentReference,
      },
    });

    if (payment.reference?.startsWith("renewal:")) {
      const renewalId = payment.reference.replace(
        "renewal:",
        "",
      );

      const renewal = await transaction.renewal.findUnique({
        where: {
          id: renewalId,
        },
      });

      if (renewal) {
        await transaction.renewal.update({
          where: {
            id: renewal.id,
          },
          data: {
            status: "PAID",
            renewedAt: new Date(),
          },
        });
      }
    }
  });

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/renovaciones");
  revalidatePath(`/clientes/${payment.clientId}`);

  redirect("/pagos?resultado=pagado");
}