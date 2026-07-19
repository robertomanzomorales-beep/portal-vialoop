import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { markPaymentAsPaid } from "./actions";
import styles from "./pagos.module.css";

type PaymentsPageProps = {
  searchParams: Promise<{
    filtro?: string;
    resultado?: string;
  }>;
};

type PaymentFilter =
  | "todos"
  | "pendientes"
  | "vencidos"
  | "pagados"
  | "cancelados";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "$0";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
    CANCELLED: "Cancelado",
    REFUNDED: "Reembolsado",
  };

  return labels[status] ?? status;
}

function isVisibleByFilter(
  status: string,
  filter: PaymentFilter,
) {
  if (filter === "todos") {
    return true;
  }

  if (filter === "pendientes") {
    return status === "PENDING";
  }

  if (filter === "vencidos") {
    return status === "OVERDUE";
  }

  if (filter === "pagados") {
    return status === "PAID";
  }

  if (filter === "cancelados") {
    return status === "CANCELLED";
  }

  return true;
}

export default async function PaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  const resolvedSearchParams = await searchParams;

  const validFilters: PaymentFilter[] = [
    "todos",
    "pendientes",
    "vencidos",
    "pagados",
    "cancelados",
  ];

  const requestedFilter =
    resolvedSearchParams.filtro ?? "todos";

  const activeFilter = validFilters.includes(
    requestedFilter as PaymentFilter,
  )
    ? (requestedFilter as PaymentFilter)
    : "todos";

  const payments = await prisma.payment.findMany({
    orderBy: [
      {
        dueDate: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
    include: {
      client: true,
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  const filteredPayments = payments.filter((payment) =>
    isVisibleByFilter(payment.status, activeFilter),
  );

  const pendingCount = payments.filter(
    (payment) => payment.status === "PENDING",
  ).length;

  const overdueCount = payments.filter(
    (payment) => payment.status === "OVERDUE",
  ).length;

  const paidCount = payments.filter(
    (payment) => payment.status === "PAID",
  ).length;

  const pendingAmount = payments
    .filter(
      (payment) =>
        payment.status === "PENDING" ||
        payment.status === "OVERDUE",
    )
    .reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

  const paidAmount = payments
    .filter((payment) => payment.status === "PAID")
    .reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

  const filters: Array<{
    label: string;
    value: PaymentFilter;
    count: number;
  }> = [
    {
      label: "Todos",
      value: "todos",
      count: payments.length,
    },
    {
      label: "Pendientes",
      value: "pendientes",
      count: pendingCount,
    },
    {
      label: "Vencidos",
      value: "vencidos",
      count: overdueCount,
    },
    {
      label: "Pagados",
      value: "pagados",
      count: paidCount,
    },
    {
      label: "Cancelados",
      value: "cancelados",
      count: payments.filter(
        (payment) => payment.status === "CANCELLED",
      ).length,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Administración financiera
          </span>

          <h1>Pagos y cobros</h1>

          <p>
            Revisa cobros pendientes, vencimientos, transferencias y
            pagos recibidos por Vialoop.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href="/renovaciones"
          >
            Ver renovaciones
          </Link>

          <Link className={styles.secondaryButton} href="/">
            Volver al dashboard
          </Link>
        </div>
      </header>

      {resolvedSearchParams.resultado === "creado" && (
        <div className={styles.successMessage}>
          El cobro fue generado correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado === "existente" && (
        <div className={styles.noticeMessage}>
          Esta renovación ya tenía un cobro generado.
        </div>
      )}

      {resolvedSearchParams.resultado === "pagado" && (
        <div className={styles.successMessage}>
          El pago fue registrado correctamente.
        </div>
      )}

      <section className={styles.summary}>
        <article>
          <span>Cobros pendientes</span>
          <strong>{pendingCount}</strong>
          <p>Pagos dentro de su plazo</p>
        </article>

        <article className={overdueCount > 0 ? styles.alertCard : ""}>
          <span>Cobros vencidos</span>
          <strong>{overdueCount}</strong>
          <p>Requieren seguimiento</p>
        </article>

        <article>
          <span>Monto por cobrar</span>
          <strong className={styles.amount}>
            {formatCurrency(pendingAmount)}
          </strong>
          <p>Pendiente y vencido</p>
        </article>

        <article>
          <span>Monto pagado</span>
          <strong className={styles.paidAmount}>
            {formatCurrency(paidAmount)}
          </strong>
          <p>Ingresos registrados</p>
        </article>
      </section>

      <nav className={styles.filters}>
        {filters.map((filter) => (
          <Link
            className={`${styles.filterButton} ${
              activeFilter === filter.value
                ? styles.activeFilter
                : ""
            }`}
            href={
              filter.value === "todos"
                ? "/pagos"
                : `/pagos?filtro=${filter.value}`
            }
            key={filter.value}
          >
            {filter.label}
            <span>{filter.count}</span>
          </Link>
        ))}
      </nav>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Registro financiero</h2>

            <p>
              Se muestran {filteredPayments.length} pagos según el
              filtro seleccionado.
            </p>
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>$</div>

            <h3>No existen pagos para este filtro</h3>

            <p>
              Los cobros generados desde renovaciones aparecerán en
              esta sección.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th>Vencimiento</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Fecha de pago</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => {
                  const markPaymentWithId =
                    markPaymentAsPaid.bind(null, payment.id);

                  return (
                    <tr key={payment.id}>
                      <td>
                        <Link
                          className={styles.clientLink}
                          href={`/clientes/${payment.clientId}`}
                        >
                          <strong>
                            {payment.client.businessName}
                          </strong>

                          <span>
                            {payment.client.email ??
                              "Sin correo registrado"}
                          </span>
                        </Link>
                      </td>

                      <td>
                        <strong className={styles.description}>
                          {payment.description}
                        </strong>

                        <span className={styles.secondaryText}>
                          {payment.subscription?.plan.name ??
                            payment.reference ??
                            "Cobro manual"}
                        </span>
                      </td>

                      <td>{formatDate(payment.dueDate)}</td>

                      <td>
                        <strong className={styles.price}>
                          {formatCurrency(payment.amount)}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            styles[
                              `status${payment.status
                                .charAt(0)
                                .toUpperCase()}${payment.status
                                .slice(1)
                                .toLowerCase()}`
                            ] ?? ""
                          }`}
                        >
                          {getPaymentStatusLabel(payment.status)}
                        </span>
                      </td>

                      <td>{formatDate(payment.paidAt)}</td>

                      <td>
                        <div className={styles.actions}>
                          {payment.status === "PENDING" ||
                          payment.status === "OVERDUE" ? (
                            <form action={markPaymentWithId}>
                              <input
                                type="hidden"
                                name="paymentMethod"
                                value="BANK_TRANSFER"
                              />

                              <button
                                className={styles.primaryAction}
                                type="submit"
                              >
                                Marcar pagado
                              </button>
                            </form>
                          ) : null}

                          <Link
                            className={styles.viewButton}
                            href={`/clientes/${payment.clientId}`}
                          >
                            Ver cliente
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}