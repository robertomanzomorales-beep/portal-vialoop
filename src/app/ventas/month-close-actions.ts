"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  getMonthlyFinancials,
  parseFinancialPeriod,
} from "@/lib/monthly-financials";
import { prisma } from "@/lib/prisma";

export type MonthCloseActionState = {
  ok: boolean;
  message: string;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function closeFinancialMonth(
  _previousState: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  const user = await requireAdmin();
  const parsed = parseFinancialPeriod(text(formData, "period"));

  if (!parsed) {
    return { ok: false, message: "El periodo seleccionado no es válido." };
  }

  const { summary } = await getMonthlyFinancials(parsed.year, parsed.month);

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      action: "FINANCIAL_MONTH_CLOSED",
      entityType: "FinancialMonth",
      entityId: parsed.period,
      description: `Cierre financiero de ${parsed.period} registrado por ${user.name}.`,
      metadata: json({
        summary,
        closedAt: new Date().toISOString(),
        closedBy: user.name,
      }),
    },
  });

  revalidatePath("/");
  revalidatePath("/ventas");

  return {
    ok: true,
    message: "Mes cerrado con una fotografía financiera verificable.",
  };
}

export async function reopenFinancialMonth(
  _previousState: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  const user = await requireAdmin();
  const parsed = parseFinancialPeriod(text(formData, "period"));

  if (!parsed) {
    return { ok: false, message: "El periodo seleccionado no es válido." };
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      action: "FINANCIAL_MONTH_REOPENED",
      entityType: "FinancialMonth",
      entityId: parsed.period,
      description: `Cierre financiero de ${parsed.period} reabierto por ${user.name}.`,
      metadata: {
        reopenedAt: new Date().toISOString(),
        reopenedBy: user.name,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/ventas");

  return {
    ok: true,
    message: "Mes reabierto. Puedes ajustar movimientos y volver a cerrarlo.",
  };
}
