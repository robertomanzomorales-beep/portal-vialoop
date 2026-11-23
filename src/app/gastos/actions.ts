"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import {
  getNextExpenseDueDate,
  isExpenseCategory,
  isExpenseFrequency,
  isExpenseTaxTreatment,
  parseExpenseMetadata,
  type ExpenseMetadata,
} from "@/lib/expense";
import { prisma } from "@/lib/prisma";

export type ExpenseActionState = {
  ok: boolean;
  message: string;
  savedId?: string;
  deletedId?: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function text(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function dateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function amount(value: string) {
  const parsed = Math.round(Number(value.replace(/[^\d]/g, "")));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function saveExpense(
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const user = await requireUser();
  const id = text(formData, "id");
  const concept = text(formData, "concept");
  const expenseAmount = amount(text(formData, "amount"));
  const category = text(formData, "category");
  const taxTreatment = text(formData, "taxTreatment");
  const frequency = text(formData, "frequency");
  const nextDueDate = dateKey(text(formData, "nextDueDate"));
  const notes = text(formData, "notes");

  if (
    !concept ||
    expenseAmount <= 0 ||
    !nextDueDate ||
    !isExpenseCategory(category) ||
    !isExpenseTaxTreatment(taxTreatment) ||
    !isExpenseFrequency(frequency)
  ) {
    return {
      ok: false,
      message: "Completa el concepto, monto, categoría, tratamiento de IVA, frecuencia y próximo vencimiento.",
    };
  }

  const existing = id
    ? await prisma.activityLog.findFirst({
        where: { id, entityType: "Expense" },
        select: { id: true, metadata: true },
      })
    : null;
  const previous = existing ? parseExpenseMetadata(existing.metadata) : null;

  if (id && !previous) {
    return { ok: false, message: "El gasto ya no existe." };
  }

  const metadata: ExpenseMetadata = {
    concept,
    amount: expenseAmount,
    category,
    taxTreatment,
    frequency,
    nextDueDate,
    active: true,
    notes,
    lastPaidAt: previous?.lastPaidAt ?? "",
    payments: previous?.payments ?? [],
    updatedAt: new Date().toISOString(),
  };

  const saved = existing
    ? await prisma.activityLog.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          action: "EXPENSE_UPDATED",
          entityId: concept,
          description: `${concept} actualizado.`,
          metadata: json(metadata),
        },
      })
    : await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "EXPENSE_CREATED",
          entityType: "Expense",
          entityId: concept,
          description: `${concept} agregado al control de gastos.`,
          metadata: json(metadata),
        },
      });

  revalidatePath("/");
  revalidatePath("/gastos");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: `${concept} ${existing ? "actualizado" : "registrado"} correctamente.`,
    savedId: saved.id,
  };
}

export async function markExpensePaid(
  id: string,
  paidAtValue: string,
): Promise<ExpenseActionState> {
  const user = await requireUser();
  const existing = await prisma.activityLog.findFirst({
    where: { id, entityType: "Expense" },
    select: { id: true, metadata: true },
  });
  const expense = existing ? parseExpenseMetadata(existing.metadata) : null;

  if (!existing || !expense) {
    return { ok: false, message: "El gasto ya no existe." };
  }

  const paidAt = dateKey(paidAtValue);
  if (!paidAt) {
    return { ok: false, message: "La fecha real de pago no es válida." };
  }
  const recurring = expense.frequency !== "ONE_TIME";
  const metadata: ExpenseMetadata = {
    ...expense,
    active: recurring,
    lastPaidAt: paidAt,
    nextDueDate: recurring
      ? getNextExpenseDueDate(expense.nextDueDate, expense.frequency)
      : expense.nextDueDate,
    payments: [
      { id: randomUUID(), paidAt, amount: expense.amount },
      ...expense.payments,
    ].slice(0, 100),
    updatedAt: new Date().toISOString(),
  };

  await prisma.activityLog.update({
    where: { id },
    data: {
      userId: user.id,
      action: "EXPENSE_PAID",
      description: `${expense.concept} marcado como pagado.`,
      metadata: json(metadata),
    },
  });

  revalidatePath("/");
  revalidatePath("/gastos");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: recurring
      ? `${expense.concept} pagado; próximo vencimiento programado.`
      : `${expense.concept} pagado y cerrado.`,
    savedId: id,
  };
}

export async function deleteExpense(id: string): Promise<ExpenseActionState> {
  await requireUser();
  const deleted = await prisma.activityLog.deleteMany({
    where: { id, entityType: "Expense" },
  });

  if (deleted.count !== 1) {
    return { ok: false, message: "El gasto ya no existe." };
  }

  revalidatePath("/");
  revalidatePath("/gastos");
  revalidatePath("/seguimiento");

  return {
    ok: true,
    message: "Gasto eliminado correctamente.",
    deletedId: id,
  };
}
