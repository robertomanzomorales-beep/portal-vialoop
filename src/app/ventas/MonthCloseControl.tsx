"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MonthlyFinancialSummary } from "@/lib/monthly-financials";
import {
  closeFinancialMonth,
  reopenFinancialMonth,
  type MonthCloseActionState,
} from "./month-close-actions";
import styles from "./ventas.module.css";

const initialState: MonthCloseActionState = { ok: false, message: "" };

function currency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MonthCloseControl({
  period,
  monthLabel,
  summary,
  closed,
  needsReview,
  closedAt,
  closedBy,
  canManage,
}: {
  period: string;
  monthLabel: string;
  summary: MonthlyFinancialSummary;
  closed: boolean;
  needsReview: boolean;
  closedAt: string;
  closedBy: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [closeState, closeAction, closePending] = useActionState(
    closeFinancialMonth,
    initialState,
  );
  const [reopenState, reopenAction, reopenPending] = useActionState(
    reopenFinancialMonth,
    initialState,
  );
  const feedback = closeState.message ? closeState : reopenState;

  useEffect(() => {
    if (closeState.ok || reopenState.ok) router.refresh();
  }, [closeState.ok, reopenState.ok, router]);

  return (
    <section className={styles.closePanel}>
      <div className={styles.closeHeader}>
        <div>
          <span className={styles.eyebrow}>Control de fin de mes</span>
          <h2>Cierre financiero · {monthLabel}</h2>
          <p>
            Consolida ventas, caja, gastos pagados e IVA sin mezclar venta
            devengada con dinero efectivamente recibido.
          </p>
        </div>
        <span
          className={`${styles.closeStatus} ${
            needsReview
              ? styles.closeStatusReview
              : closed
                ? styles.closeStatusClosed
                : styles.closeStatusOpen
          }`}
        >
          {needsReview ? "Requiere revisión" : closed ? "Mes cerrado" : "Mes abierto"}
        </span>
      </div>

      <div className={styles.closeMetrics}>
        <div>
          <span>Venta neta</span>
          <strong>{currency(summary.netSales)}</strong>
        </div>
        <div>
          <span>IVA estimado por pagar</span>
          <strong>{currency(summary.estimatedVatPayable)}</strong>
        </div>
        <div>
          <span>Caja cobrada</span>
          <strong>{currency(summary.cashCollected)}</strong>
        </div>
        <div>
          <span>Resultado operativo</span>
          <strong>{currency(summary.operatingResult)}</strong>
        </div>
      </div>

      <div className={styles.closeFooter}>
        <div>
          {needsReview ? (
            <p>
              Hubo movimientos después del cierre de {closedAt}. Revisa los
              valores y registra un cierre actualizado.
            </p>
          ) : closed ? (
            <p>
              Cierre registrado {closedAt}{closedBy ? ` por ${closedBy}` : ""}.
              La fotografía del mes quedó guardada en el historial.
            </p>
          ) : (
            <p>
              Antes de cerrar, revisa gastos con IVA, cobros pendientes y pagos
              de hosting confirmados.
            </p>
          )}
          {feedback.message ? (
            <span className={feedback.ok ? styles.closeFeedbackOk : styles.closeFeedbackError}>
              {feedback.message}
            </span>
          ) : null}
        </div>

        {canManage ? (
          closed && !needsReview ? (
            <form action={reopenAction}>
              <input name="period" type="hidden" value={period} />
              <button
                className={styles.secondaryButton}
                disabled={reopenPending}
                type="submit"
              >
                {reopenPending ? "Reabriendo..." : "Reabrir mes"}
              </button>
            </form>
          ) : (
            <form
              action={closeAction}
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    `¿Confirmas el cierre financiero de ${monthLabel}? Se guardará una fotografía de los valores actuales.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input name="period" type="hidden" value={period} />
              <button className={styles.primaryButton} disabled={closePending} type="submit">
                {closePending ? "Cerrando..." : needsReview ? "Actualizar cierre" : "Cerrar mes"}
              </button>
            </form>
          )
        ) : null}
      </div>
    </section>
  );
}
