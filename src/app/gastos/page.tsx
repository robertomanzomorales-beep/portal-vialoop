import { parseExpenseMetadata } from "@/lib/expense";
import { prisma } from "@/lib/prisma";
import ExpenseManager, { type ExpenseRecord } from "./ExpenseManager";
import styles from "./gastos.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function chileDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date());
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthlyEquivalent(record: ExpenseRecord) {
  const amount = record.metadata.amount;
  if (record.metadata.frequency === "WEEKLY") return amount * 52 / 12;
  if (record.metadata.frequency === "ANNUAL") return amount / 12;
  if (record.metadata.frequency === "ONE_TIME") return 0;
  return amount;
}

export default async function ExpensesPage() {
  const logs = await prisma.activityLog.findMany({
    where: { entityType: "Expense" },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const expenses: ExpenseRecord[] = logs
    .map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      metadata: parseExpenseMetadata(log.metadata),
    }))
    .filter((record): record is ExpenseRecord => Boolean(record.metadata));
  const active = expenses.filter((expense) => expense.metadata.active);
  const today = chileDateKey();
  const nextThirtyDays = addDays(today, 30);
  const upcoming = active.filter(
    (expense) => expense.metadata.nextDueDate <= nextThirtyDays,
  );
  const overdue = active.filter(
    (expense) => expense.metadata.nextDueDate < today,
  );
  const monthly = active.reduce(
    (total, expense) => total + monthlyEquivalent(expense),
    0,
  );
  const vialoopMonthly = active
    .filter((expense) => expense.metadata.category === "VIALOOP")
    .reduce((total, expense) => total + monthlyEquivalent(expense), 0);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Control financiero</span>
          <h1>Gastos</h1>
          <p>
            Programa compromisos recurrentes, registra pagos y anticipa vencimientos de Vialoop y casa.
          </p>
        </div>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Compromiso mensual estimado</span>
          <strong>{currency(monthly)}</strong>
          <small>Equivalencia de gastos activos</small>
        </article>
        <article>
          <span>Operación Vialoop</span>
          <strong>{currency(vialoopMonthly)}</strong>
          <small>Equivalencia mensual del negocio</small>
        </article>
        <article className={overdue.length ? styles.metricAlert : undefined}>
          <span>Vencidos</span>
          <strong>{overdue.length}</strong>
          <small>Requieren regularización</small>
        </article>
        <article>
          <span>Próximos 30 días</span>
          <strong>{upcoming.length}</strong>
          <small>Pagos programados</small>
        </article>
      </section>

      <ExpenseManager expenses={expenses} today={today} />
    </main>
  );
}
