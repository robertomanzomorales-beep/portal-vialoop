"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type SaleActionState = {
  ok: boolean;
  message: string;
};

function getText(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseDateOnly(
  value: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return null;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function parseAmount(
  value: string,
) {
  const normalizedValue =
    value.replace(/[^\d]/g, "");

  const amount = Number(
    normalizedValue,
  );

  return Number.isFinite(amount)
    ? amount
    : 0;
}

export async function saveSale(
  _previousState: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  const saleId = getText(
    formData,
    "saleId",
  );

  const clientId = getText(
    formData,
    "clientId",
  );

  const service = getText(
    formData,
    "service",
  );

  const saleDate = parseDateOnly(
    getText(
      formData,
      "saleDate",
    ),
  );

  const netAmount = parseAmount(
    getText(
      formData,
      "netAmount",
    ),
  );

  const notes = getText(
    formData,
    "notes",
  );

  if (
    !clientId ||
    !service ||
    !saleDate ||
    netAmount <= 0
  ) {
    return {
      ok: false,
      message:
        "Completa el cliente, el servicio, la fecha y un monto neto mayor que cero.",
    };
  }

  const clientExists =
    await prisma.client.findUnique({
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
      message:
        "El cliente seleccionado ya no existe.",
    };
  }

  if (saleId) {
    const saleExists =
      await prisma.sale.findUnique({
        where: {
          id: saleId,
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (!saleExists) {
      return {
        ok: false,
        message:
          "La venta que intentas editar ya no existe.",
      };
    }

    if (
      saleExists.status ===
      "CANCELLED"
    ) {
      return {
        ok: false,
        message:
          "Una venta anulada no puede modificarse.",
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

export async function cancelSale(
  formData: FormData,
) {
  const saleId = getText(
    formData,
    "saleId",
  );

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