"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { cancelSale, saveSale } from "./actions";
import SalePaymentManager, {
  type SaleFinancialItem,
  type SalePaymentItem,
} from "./SalePaymentManager";
import styles from "./ventas.module.css";

type SaleActionState = {
  ok: boolean;
  message: string;
};

const initialSaleActionState: SaleActionState = {
  ok: false,
  message: "",
};

export type SaleClientOption = {
  id: string;
  name: string;
};

export type SaleListItem = SaleFinancialItem & {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  service: string;
  saleDate: string;
  displayDate: string;
  netAmount: number;
  formattedAmount: string;
  notes: string;
  status: "ACTIVE" | "CANCELLED";
  payments: SalePaymentItem[];
};

type SalesManagerProps = {
  clients: SaleClientOption[];
  sales: SaleListItem[];
  today: string;
};

function SaleEditor({
  clients,
  sale,
  today,
  onClose,
}: {
  clients: SaleClientOption[];
  sale: SaleListItem | null;
  today: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveSale,
    initialSaleActionState,
  );

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [state.ok, onClose]);

  return (
    <div
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>
              {sale ? `Venta N.º ${sale.number}` : "Nueva operación"}
            </span>
            <h2>{sale ? "Editar venta" : "Registrar venta"}</h2>
            <p>Todos los montos se registran netos, sin IVA.</p>
          </div>

          <button
            aria-label="Cerrar"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form action={formAction} className={styles.form}>
          <input name="saleId" type="hidden" value={sale?.id ?? ""} />

          <label className={styles.field}>
            <span>Cliente</span>
            <select
              defaultValue={sale?.clientId ?? ""}
              name="clientId"
              required
            >
              <option disabled value="">
                Selecciona un cliente
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Servicio vendido</span>
            <input
              defaultValue={sale?.service ?? ""}
              maxLength={160}
              name="service"
              placeholder="Ej.: Sitio web Plan Empresa"
              required
              type="text"
            />
          </label>

          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Fecha de venta</span>
              <input
                defaultValue={sale?.saleDate ?? today}
                name="saleDate"
                required
                type="date"
              />
            </label>

            <label className={styles.field}>
              <span>Monto neto</span>
              <input
                defaultValue={sale?.netAmount ?? ""}
                inputMode="numeric"
                min="1"
                name="netAmount"
                placeholder="350000"
                required
                step="1"
                type="number"
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Observaciones</span>
            <textarea
              defaultValue={sale?.notes ?? ""}
              maxLength={600}
              name="notes"
              placeholder="Opcional"
              rows={4}
            />
          </label>

          {state.message && !state.ok ? (
            <p className={styles.formError}>{state.message}</p>
          ) : null}

          <div className={styles.formActions}>
            <button
              className={styles.secondaryButton}
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>

            <button
              className={styles.primaryButton}
              disabled={pending}
              type="submit"
            >
              {pending
                ? "Guardando..."
                : sale
                  ? "Guardar cambios"
                  : "Registrar venta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SalesManager({
  clients,
  sales,
  today,
}: SalesManagerProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedSale, setSelectedSale] =
    useState<SaleListItem | null>(null);
  const [financialSale, setFinancialSale] =
    useState<SaleListItem | null>(null);

  const closeEditor = () => {
    setEditorOpen(false);
    setSelectedSale(null);
  };

  const createSale = () => {
    setSelectedSale(null);
    setEditorOpen(true);
  };

  const editSale = (sale: SaleListItem) => {
    setSelectedSale(sale);
    setEditorOpen(true);
  };

  return (
    <>
      <div className={styles.listHeader}>
        <div>
          <span className={styles.eyebrow}>Registro comercial</span>
          <h2>Ventas registradas</h2>
          <p>
            Las ventas anuladas permanecen visibles, pero no suman en los
            indicadores.
          </p>
        </div>

        <button
          className={styles.primaryButton}
          disabled={clients.length === 0}
          onClick={createSale}
          type="button"
        >
          Registrar venta
        </button>
      </div>

      {clients.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No existen clientes disponibles</strong>
          <p>Primero debes registrar un cliente para asociarle una venta.</p>
        </div>
      ) : sales.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>Aún no hay ventas registradas</strong>
          <p>La primera venta que ingreses aparecerá en este listado.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Monto neto</th>
                <th>Pago</th>
                <th>Venta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr
                  className={
                    sale.status === "CANCELLED"
                      ? styles.cancelledRow
                      : undefined
                  }
                  key={sale.id}
                >
                  <td>#{sale.number}</td>
                  <td>{sale.displayDate}</td>
                  <td>
                    <strong>{sale.clientName}</strong>
                  </td>
                  <td>
                    <strong>{sale.service}</strong>
                    {sale.notes ? <small>{sale.notes}</small> : null}
                  </td>
                  <td className={styles.amountCell}>
                    <strong>{sale.formattedAmount}</strong>
                    <small>Con IVA: {sale.formattedGrossAmount}</small>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        sale.financialStatus === "PAID"
                          ? styles.statusPaid
                          : sale.financialStatus === "PARTIAL"
                            ? styles.statusPartial
                            : styles.statusUnpaid
                      }`}
                    >
                      {sale.financialStatus === "PAID"
                        ? "Pagada"
                        : sale.financialStatus === "PARTIAL"
                          ? "Pago parcial"
                          : "Sin pagos"}
                    </span>
                    <small className={styles.balanceLabel}>
                      Saldo {sale.formattedBalanceAmount}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        sale.status === "ACTIVE"
                          ? styles.statusActive
                          : styles.statusCancelled
                      }`}
                    >
                      {sale.status === "ACTIVE" ? "Activa" : "Anulada"}
                    </span>
                  </td>
                  <td>
                    {sale.status === "ACTIVE" ? (
                      <div className={styles.rowActions}>
                        <button
                          className={styles.manageButton}
                          onClick={() => setFinancialSale(sale)}
                          type="button"
                        >
                          Gestionar pagos
                        </button>

                        <button
                          className={styles.textButton}
                          onClick={() => editSale(sale)}
                          type="button"
                        >
                          Editar
                        </button>

                        {sale.payments.length === 0 ? (
                          <form
                            action={cancelSale}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  "¿Seguro que deseas anular esta venta? Dejará de sumar en los indicadores.",
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input
                              name="saleId"
                              type="hidden"
                              value={sale.id}
                            />
                            <button
                              className={styles.dangerButton}
                              type="submit"
                            >
                              Anular
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        className={styles.textButton}
                        onClick={() => setFinancialSale(sale)}
                        type="button"
                      >
                        Ver pagos
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editorOpen ? (
        <SaleEditor
          clients={clients}
          onClose={closeEditor}
          sale={selectedSale}
          today={today}
        />
      ) : null}

      {financialSale ? (
        <SalePaymentManager
          onClose={() => setFinancialSale(null)}
          sale={financialSale}
        />
      ) : null}
    </>
  );
}
