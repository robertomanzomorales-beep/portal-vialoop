"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  expenseCategories,
  expenseFrequencies,
  expenseTaxTreatments,
  getExpenseCategoryLabel,
  getExpenseFrequencyLabel,
  getExpenseTaxTreatmentLabel,
  type ExpenseMetadata,
} from "@/lib/expense";
import {
  deleteExpense,
  markExpensePaid,
  saveExpense,
  type ExpenseActionState,
} from "./actions";
import styles from "./gastos.module.css";

export type ExpenseRecord = {
  id: string;
  createdAt: string;
  metadata: ExpenseMetadata;
};

const initialState: ExpenseActionState = { ok: false, message: "" };

function currency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export default function ExpenseManager({
  expenses,
  today,
}: {
  expenses: ExpenseRecord[];
  today: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveExpense, initialState);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | "VIALOOP" | "HOME">("ALL");
  const [actionId, setActionId] = useState<string | null>(null);
  const [payingExpense, setPayingExpense] = useState<ExpenseRecord | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ExpenseActionState | null>(null);
  const [isTransitioning, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (category !== "ALL" && expense.metadata.category !== category) return false;
      if (!normalized) return true;
      return `${expense.metadata.concept} ${expense.metadata.notes}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [category, expenses, query]);

  const openEditor = (expense: ExpenseRecord | null) => {
    setEditing(expense);
    setFormVersion((current) => current + 1);
    window.setTimeout(() => {
      document.getElementById("expense-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 20);
  };

  const runAction = (id: string, action: () => Promise<ExpenseActionState>) => {
    setActionId(id);
    setActionFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        setActionFeedback(result);
        if (result.ok) router.refresh();
      } catch {
        setActionFeedback({ ok: false, message: "No fue posible completar la operación." });
      } finally {
        setActionId(null);
      }
    });
  };

  return (
    <section className={styles.manager}>
      <div className={styles.managerHeader}>
        <div>
          <span className={styles.eyebrow}>Programación</span>
          <h2>Compromisos y vencimientos</h2>
          <p>Cada gasto activo aparece también en el calendario general de Seguimiento.</p>
        </div>
        <button className={styles.primaryButton} onClick={() => openEditor(null)} type="button">
          + Registrar gasto
        </button>
      </div>

      <form
        action={formAction}
        className={styles.editor}
        id="expense-editor"
        key={`${editing?.id ?? "new"}-${formVersion}`}
      >
        <input name="id" type="hidden" value={editing?.id ?? ""} />
        <div className={styles.editorHeading}>
          <div>
            <strong>{editing ? `Editar ${editing.metadata.concept}` : "Nuevo gasto"}</strong>
            <span>Registra el valor, recurrencia y próxima fecha de pago.</span>
          </div>
          {editing ? (
            <button className={styles.textButton} onClick={() => openEditor(null)} type="button">
              Crear otro
            </button>
          ) : null}
        </div>
        <label>
          <span>Concepto *</span>
          <input defaultValue={editing?.metadata.concept} name="concept" required />
        </label>
        <label>
          <span>Monto *</span>
          <input defaultValue={editing?.metadata.amount} min="1" name="amount" required type="number" />
        </label>
        <label>
          <span>Categoría *</span>
          <select defaultValue={editing?.metadata.category ?? "VIALOOP"} name="category">
            {expenseCategories.map((item) => (
              <option key={item} value={item}>{getExpenseCategoryLabel(item)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Tratamiento de IVA *</span>
          <select
            defaultValue={editing?.metadata.taxTreatment ?? "TAXABLE"}
            name="taxTreatment"
          >
            {expenseTaxTreatments.map((item) => (
              <option key={item} value={item}>
                {getExpenseTaxTreatmentLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Frecuencia *</span>
          <select defaultValue={editing?.metadata.frequency ?? "MONTHLY"} name="frequency">
            {expenseFrequencies.map((item) => (
              <option key={item} value={item}>{getExpenseFrequencyLabel(item)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Próximo vencimiento *</span>
          <input defaultValue={editing?.metadata.nextDueDate ?? today} name="nextDueDate" required type="date" />
        </label>
        <label className={styles.wideField}>
          <span>Notas</span>
          <textarea defaultValue={editing?.metadata.notes} name="notes" rows={3} />
        </label>
        <div className={styles.editorActions}>
          {state.message ? (
            <p className={state.ok ? styles.feedbackSuccess : styles.feedbackError}>{state.message}</p>
          ) : <span />}
          <button className={styles.primaryButton} disabled={pending} type="submit">
            {pending ? "Guardando..." : editing ? "Guardar cambios" : "Registrar gasto"}
          </button>
        </div>
      </form>

      <div className={styles.filters}>
        <input
          aria-label="Buscar gastos"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar concepto o nota"
          type="search"
          value={query}
        />
        <select
          aria-label="Filtrar por categoría"
          onChange={(event) => setCategory(event.target.value as typeof category)}
          value={category}
        >
          <option value="ALL">Todas las categorías</option>
          <option value="VIALOOP">Vialoop</option>
          <option value="HOME">Casa</option>
        </select>
      </div>

      {actionFeedback ? (
        <p className={actionFeedback.ok ? styles.feedbackSuccess : styles.feedbackError}>
          {actionFeedback.message}
        </p>
      ) : null}

      <div className={styles.expenseList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No hay gastos para mostrar</strong>
            <span>Registra el primer compromiso o ajusta los filtros.</span>
          </div>
        ) : filtered.map((expense) => {
          const overdue = expense.metadata.active && expense.metadata.nextDueDate < today;
          const busy = isTransitioning && actionId === expense.id;
          return (
            <article className={!expense.metadata.active ? styles.expenseInactive : undefined} key={expense.id}>
              <div className={styles.expenseIdentity}>
                <span>{getExpenseCategoryLabel(expense.metadata.category)}</span>
                <strong>{expense.metadata.concept}</strong>
                <small>{getExpenseFrequencyLabel(expense.metadata.frequency)}</small>
              </div>
              <div className={styles.expenseAmount}>
                <span>Monto</span>
                <strong>{currency(expense.metadata.amount)}</strong>
                <small>{getExpenseTaxTreatmentLabel(expense.metadata.taxTreatment)}</small>
              </div>
              <div className={`${styles.expenseDue} ${overdue ? styles.expenseOverdue : ""}`}>
                <span>{expense.metadata.active ? "Próximo pago" : "Estado"}</span>
                <strong>{expense.metadata.active ? date(expense.metadata.nextDueDate) : "Completado"}</strong>
              </div>
              <div className={styles.expenseActions}>
                {expense.metadata.active ? (
                  <button
                    disabled={busy}
                    onClick={() => setPayingExpense(expense)}
                    type="button"
                  >
                    Marcar pagado
                  </button>
                ) : null}
                <button onClick={() => openEditor(expense)} type="button">Editar</button>
                <button
                  className={styles.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${expense.metadata.concept}?`)) {
                      runAction(expense.id, () => deleteExpense(expense.id));
                    }
                  }}
                  type="button"
                >
                  Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {payingExpense ? (
        <div
          className={styles.paymentBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPayingExpense(null);
          }}
          role="presentation"
        >
          <form
            className={styles.paymentDialog}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const paidAt = String(form.get("paidAt") ?? "");
              runAction(payingExpense.id, () => markExpensePaid(payingExpense.id, paidAt));
              setPayingExpense(null);
            }}
          >
            <div>
              <span className={styles.eyebrow}>Registro de caja</span>
              <h3>Confirmar pago del gasto</h3>
              <p>
                {payingExpense.metadata.concept} · {currency(payingExpense.metadata.amount)}
              </p>
            </div>
            <label>
              <span>Fecha real del pago</span>
              <input defaultValue={today} name="paidAt" required type="date" />
            </label>
            <small>
              Esta fecha define el mes contable en el cierre financiero y el IVA crédito.
            </small>
            <footer>
              <button
                className={styles.secondaryButton}
                onClick={() => setPayingExpense(null)}
                type="button"
              >
                Cancelar
              </button>
              <button className={styles.primaryButton} type="submit">
                Confirmar pago
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
