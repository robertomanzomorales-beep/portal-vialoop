"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSalesGoalKey } from "@/lib/sales-goal";

type SaleActionState = {
  ok: boolean;
  message: string;
};

function getText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(value: string) {
  const normalizedValue = value.replace(/[^\d]/g, "");
  const amount = Number(normalizedValue);

  return Number.isFinite(amount) ? amount : 0;
}

export async function saveSale(
  _previousState: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  await requireUser();

  const saleId = getText(formData, "saleId");
  const clientId = getText(formData, "clientId");
  const service = getText(formData, "service");
  const saleDate = parseDateOnly(getText(formData, "saleDate"));
  const netAmount = parseAmount(getText(formData, "netAmount"));
  const notes = getText(formData, "notes");

  if (!clientId || !service || !saleDate || netAmount <= 0) {
    return {
      ok: false,
      message:
        "Completa el cliente, el servicio, la fecha y un monto neto mayor que cero.",
    };
  }

  const clientExists = await prisma.client.findUnique({
    where: {
      id: clientId,
    },
    select: {
      id: true,
    },
  });

  if (!clientExists) {
    return {
      ok: false,
      message: "El cliente seleccionado ya no existe.",
    };
  }

  if (saleId) {
    const saleExists = await prisma.sale.findUnique({
      where: {
        id: saleId,
      },
      select: {
        id: true,
        status: true,
        payments: {
          select: {
            amount: true,
          },
        },
      },
    });

    if (!saleExists) {
      return {
        ok: false,
        message: "La venta que intentas editar ya no existe.",
      };
    }

    if (saleExists.status === "CANCELLED") {
      return {
        ok: false,
        message: "Una venta anulada no puede modificarse.",
      };
    }

    const totalPaid = saleExists.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const totalWithVat = netAmount + Math.round(netAmount * 0.19);

    if (totalWithVat < totalPaid) {
      return {
        ok: false,
        message:
          "El nuevo total de la venta no puede ser inferior a los pagos ya registrados.",
      };
    }

    await prisma.sale.update({
      where: {
        id: saleId,
      },
      data: {
        clientId,
        service,
        saleDate,
        netAmount,
        notes: notes || null,
      },
    });
  } else {
    await prisma.sale.create({
      data: {
        clientId,
        service,
        saleDate,
        netAmount,
        notes: notes || null,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/ventas");

  return {
    ok: true,
    message: saleId
      ? "Venta actualizada correctamente."
      : "Venta registrada correctamente.",
  };
}

export async function cancelSale(formData: FormData) {
  await requireUser();

  const saleId = getText(formData, "saleId");

  if (!saleId) {
    return;
  }

  await prisma.sale.updateMany({
    where: {
      id: saleId,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/ventas");
}

export async function deleteSale(
  _previousState: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  await requireUser();

  const saleId = getText(formData, "saleId");

  if (!saleId) {
    return {
      ok: false,
      message: "No se pudo identificar la venta que deseas eliminar.",
    };
  }

  const sale = await prisma.sale.findUnique({
    where: {
      id: saleId,
    },
    select: {
      id: true,
      number: true,
    },
  });

  if (!sale) {
    return {
      ok: false,
      message: "La venta que intentas eliminar ya no existe.",
    };
  }

  try {
    await prisma.sale.delete({
      where: {
        id: sale.id,
      },
    });
  } catch (error) {
    console.error(`No se pudo eliminar la venta N.º ${sale.number}.`, error);

    return {
      ok: false,
      message:
        "No fue posible eliminar la venta. Actualiza la página e inténtalo nuevamente.",
    };
  }

  revalidatePath("/");
  revalidatePath("/ventas");

  return {
    ok: true,
    message: `Venta N.º ${sale.number} eliminada correctamente.`,
  };
}

export async function updateMonthlyGoal(
  formData: FormData,
) {
  await requireUser();

  const period =
    getText(formData, "period");

  const amount =
    parseAmount(
      getText(formData, "goal"),
    );

  const match =
    /^(\d{4})-(\d{2})$/.exec(
      period,
    );

  if (!match || amount <= 0) {
    throw new Error(
      "Selecciona un mes y una meta mayor que cero.",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    year < 2020 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      "El periodo seleccionado no es válido.",
    );
  }

  const key =
    getSalesGoalKey(year, month);

  await prisma.counter.upsert({
    where: {
      key,
    },
    update: {
      nextValue: amount,
    },
    create: {
      key,
      nextValue: amount,
    },
  });

  revalidatePath("/");
  revalidatePath("/ventas");
}
