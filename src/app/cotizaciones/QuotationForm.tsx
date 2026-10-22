"use client";

import Link from "next/link";
import {
  useActionState,
  useMemo,
  useState,
} from "react";
import {
  createAndSendQuotation,
  type QuotationActionState,
} from "./actions";
import styles from "./cotizaciones.module.css";

type ClientOption = {
  id: string;
  name: string;
  contactName: string;
  email: string;
};

type EditableItem = {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
};

const initialState: QuotationActionState = {
  ok: false,
  message: "",
};

function currency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function QuotationForm({
  clients,
}: {
  clients: ClientOption[];
}) {
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    createAndSendQuotation,
    initialState,
  );

  const [clientId, setClientId] =
    useState("");
  const [contactName, setContactName] =
    useState("");
  const [recipientEmail, setRecipientEmail] =
    useState("");
  const [nextItemId, setNextItemId] =
    useState(2);
  const [items, setItems] =
    useState<EditableItem[]>([
      {
        id: 1,
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);

  const totals = useMemo(() => {
    const net = items.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(item.quantity) || 0,
        ) *
          Math.max(
            0,
            Number(item.unitPrice) || 0,
          ),
      0,
    );

    const tax = Math.round(net * 0.19);

    return {
      net,
      tax,
      total: net + tax,
    };
  }, [items]);

  const serializedItems = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      ),
    [items],
  );

  const updateItem = (
    id: number,
    field:
      | "description"
      | "quantity"
      | "unitPrice",
    value: string,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: nextItemId,
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
    setNextItemId(
      (current) => current + 1,
    );
  };

  const selectClient = (
    value: string,
  ) => {
    setClientId(value);

    const client = clients.find(
      (item) => item.id === value,
    );

    if (client) {
      setContactName(client.contactName);
      setRecipientEmail(client.email);
    }
  };

  return (
    <form
      action={formAction}
      className={styles.quotationForm}
    >
      <input
        name="items"
        type="hidden"
        value={serializedItems}
      />

      <div className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <span>01</span>
          <div>
            <h2>Cliente y envío</h2>
            <p>
              La cotización se enviará por correo con el PDF adjunto.
            </p>
          </div>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Cliente *</span>
            <select
              name="clientId"
              onChange={(event) =>
                selectClient(
                  event.target.value,
                )
              }
              required
              value={clientId}
            >
              <option disabled value="">
                Selecciona un cliente
              </option>

              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Nombre de contacto</span>
            <input
              name="contactName"
              onChange={(event) =>
                setContactName(
                  event.target.value,
                )
              }
              value={contactName}
            />
          </label>

          <label className={styles.field}>
            <span>Correo de destino *</span>
            <input
              name="recipientEmail"
              onChange={(event) =>
                setRecipientEmail(
                  event.target.value,
                )
              }
              required
              type="email"
              value={recipientEmail}
            />
          </label>

          <label className={styles.field}>
            <span>Enviar de parte de *</span>
            <select
              defaultValue="doris"
              name="sender"
              required
            >
              <option value="doris">
                Doris Loayza · Ventas
              </option>
              <option value="roberto">
                Roberto Manzo · Proyectos
              </option>
            </select>
          </label>

          <label
            className={`${styles.field} ${styles.fullWidth}`}
          >
            <span>Proyecto o propuesta</span>
            <input
              name="projectName"
              placeholder="Ej.: Desarrollo sitio web corporativo"
            />
          </label>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <span>02</span>
          <div>
            <h2>Servicios y valores</h2>
            <p>
              Ingresa valores netos. El IVA se calcula automáticamente.
            </p>
          </div>
        </div>

        <div className={styles.itemsList}>
          {items.map((item, index) => (
            <div
              className={styles.itemRow}
              key={item.id}
            >
              <label className={styles.itemDescription}>
                <span>Servicio {index + 1}</span>
                <input
                  onChange={(event) =>
                    updateItem(
                      item.id,
                      "description",
                      event.target.value,
                    )
                  }
                  placeholder="Descripción del servicio"
                  required
                  value={item.description}
                />
              </label>

              <label>
                <span>Cantidad</span>
                <input
                  min="1"
                  onChange={(event) =>
                    updateItem(
                      item.id,
                      "quantity",
                      event.target.value,
                    )
                  }
                  required
                  step="1"
                  type="number"
                  value={item.quantity}
                />
              </label>

              <label>
                <span>Valor neto</span>
                <input
                  min="1"
                  onChange={(event) =>
                    updateItem(
                      item.id,
                      "unitPrice",
                      event.target.value,
                    )
                  }
                  placeholder="0"
                  required
                  step="1"
                  type="number"
                  value={item.unitPrice}
                />
              </label>

              <button
                aria-label={`Eliminar servicio ${index + 1}`}
                disabled={items.length === 1}
                onClick={() =>
                  setItems((current) =>
                    current.filter(
                      (currentItem) =>
                        currentItem.id !== item.id,
                    ),
                  )
                }
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          className={styles.addItemButton}
          disabled={items.length >= 20}
          onClick={addItem}
          type="button"
        >
          + Agregar servicio
        </button>

        <div className={styles.totalPanel}>
          <div>
            <span>Neto</span>
            <strong>{currency(totals.net)}</strong>
          </div>
          <div>
            <span>IVA 19%</span>
            <strong>{currency(totals.tax)}</strong>
          </div>
          <div className={styles.grandTotal}>
            <span>Total</span>
            <strong>{currency(totals.total)}</strong>
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <span>03</span>
          <div>
            <h2>Condiciones</h2>
            <p>
              Define la vigencia y cualquier antecedente comercial relevante.
            </p>
          </div>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Vigencia en días</span>
            <input
              defaultValue="15"
              max="90"
              min="1"
              name="validDays"
              type="number"
            />
          </label>

          <label
            className={`${styles.field} ${styles.fullWidth}`}
          >
            <span>Condiciones y observaciones</span>
            <textarea
              name="notes"
              placeholder="Forma de pago, plazos, alcance o información adicional."
              rows={5}
            />
          </label>
        </div>
      </div>

      {state.message && (
        <div
          className={
            state.ok
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          <span>{state.message}</span>

          {state.quotationId && (
            <Link
              href={`/api/cotizaciones/${state.quotationId}/pdf`}
              target="_blank"
            >
              Abrir PDF
            </Link>
          )}
        </div>
      )}

      <footer className={styles.formFooter}>
        <span>
          Se generará un PDF con identidad Vialoop y se enviará al correo indicado.
        </span>

        <button
          disabled={
            pending ||
            clients.length === 0 ||
            totals.net <= 0
          }
          type="submit"
        >
          {pending
            ? "Generando y enviando..."
            : "Generar y enviar cotización"}
        </button>
      </footer>
    </form>
  );
}
