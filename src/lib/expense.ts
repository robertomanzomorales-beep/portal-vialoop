export const expenseFrequencies = [
  "ONE_TIME",
  "WEEKLY",
  "MONTHLY",
  "ANNUAL",
] as const;

export const expenseCategories = ["VIALOOP", "HOME"] as const;
export const expenseTaxTreatments = ["TAXABLE", "EXEMPT"] as const;

export type ExpenseFrequency = (typeof expenseFrequencies)[number];
export type ExpenseCategory = (typeof expenseCategories)[number];
export type ExpenseTaxTreatment = (typeof expenseTaxTreatments)[number];

export type ExpensePayment = {
  id: string;
  paidAt: string;
  amount: number;
};

export type ExpenseMetadata = {
  concept: string;
  amount: number;
  category: ExpenseCategory;
  taxTreatment: ExpenseTaxTreatment;
  frequency: ExpenseFrequency;
  nextDueDate: string;
  active: boolean;
  notes: string;
  lastPaidAt: string;
  payments: ExpensePayment[];
  updatedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isExpenseFrequency(value: unknown): value is ExpenseFrequency {
  return expenseFrequencies.includes(value as ExpenseFrequency);
}

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

export function isExpenseTaxTreatment(
  value: unknown,
): value is ExpenseTaxTreatment {
  return expenseTaxTreatments.includes(value as ExpenseTaxTreatment);
}

export function parseExpenseMetadata(value: unknown): ExpenseMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  const concept = stringValue(value.concept).trim();
  const amount = Math.round(Number(value.amount));

  if (!concept || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const payments = Array.isArray(value.payments)
    ? value.payments
        .filter(isObject)
        .map((payment) => ({
          id: stringValue(payment.id),
          paidAt: stringValue(payment.paidAt),
          amount: Math.max(0, Math.round(Number(payment.amount) || 0)),
        }))
        .filter((payment) => payment.id && payment.paidAt)
        .slice(0, 100)
    : [];

  return {
    concept,
    amount,
    category: isExpenseCategory(value.category) ? value.category : "VIALOOP",
    // Los registros históricos no declaraban si el monto daba derecho a
    // crédito fiscal. Se consideran exentos hasta que una persona los revise.
    taxTreatment: isExpenseTaxTreatment(value.taxTreatment)
      ? value.taxTreatment
      : "EXEMPT",
    frequency: isExpenseFrequency(value.frequency) ? value.frequency : "MONTHLY",
    nextDueDate: stringValue(value.nextDueDate),
    active: value.active !== false,
    notes: stringValue(value.notes),
    lastPaidAt: stringValue(value.lastPaidAt),
    payments,
    updatedAt: stringValue(value.updatedAt),
  };
}

export function getExpenseFrequencyLabel(frequency: ExpenseFrequency) {
  return {
    ONE_TIME: "Una vez",
    WEEKLY: "Semanal",
    MONTHLY: "Mensual",
    ANNUAL: "Anual",
  }[frequency];
}

export function getExpenseCategoryLabel(category: ExpenseCategory) {
  return category === "VIALOOP" ? "Vialoop" : "Casa";
}

export function getExpenseTaxTreatmentLabel(
  treatment: ExpenseTaxTreatment,
) {
  return treatment === "TAXABLE"
    ? "Monto con IVA"
    : "Exento o sin crédito fiscal";
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function getNextExpenseDueDate(dateKey: string, frequency: ExpenseFrequency) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);

  if (frequency === "WEEKLY") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "MONTHLY") {
    return addMonths(date, 1).toISOString().slice(0, 10);
  } else if (frequency === "ANNUAL") {
    return addMonths(date, 12).toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}
