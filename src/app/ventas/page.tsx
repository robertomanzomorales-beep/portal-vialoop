import SalesManager, {
  type SaleListItem,
} from "./SalesManager";
import { prisma } from "@/lib/prisma";
import { getMonthlySalesGoal } from "@/lib/sales-goal";
import { updateMonthlyGoal } from "./actions";
import styles from "./ventas.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHILE_TIME_ZONE = "America/Santiago";

type SalesPageProps = {
  searchParams: Promise<{
    periodo?: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getChileDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: CHILE_TIME_ZONE,
  }).format(date);
}

function getCurrentYearAndMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: CHILE_TIME_ZONE,
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function getSelectedPeriod(
  value?: string,
) {
  const current =
    getCurrentYearAndMonth();

  const match =
    /^(\d{4})-(\d{2})$/.exec(
      value ?? "",
    );

  if (!match) {
    return current;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    year < 2020 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return current;
  }

  return {
    year,
    month,
  };
}

function createDateOnly(year: number, month: number, day = 1) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getMonthRange(year: number, month: number) {
  return {
    start: createDateOnly(year, month),
    end: createDateOnly(year, month + 1),
  };
}

function getMonthLabel(year: number, month: number, long = false) {
  const label = new Intl.DateTimeFormat("es-CL", {
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(createDateOnly(year, month));

  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

function formatDateOnly(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPaymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    BANK_TRANSFER: "Transferencia",
    FLOW: "Flow",
    CREDIT_CARD: "Tarjeta de crédito",
    DEBIT_CARD: "Tarjeta de débito",
    CASH: "Efectivo",
    OTHER: "Otro",
  };

  return labels[method] ?? method;
}

function grossFromNet(netAmount: number) {
  return netAmount + Math.round(netAmount * 0.19);
}

function netFromGross(grossAmount: number) {
  return Math.round(grossAmount / 1.19);
}

export default async function SalesPage({
  searchParams,
}: SalesPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const { year, month } =
    getSelectedPeriod(
      resolvedSearchParams.periodo,
    );

  const period = `${year}-${String(
    month,
  ).padStart(2, "0")}`;

  const currentMonth = getMonthRange(year, month);
  const firstChartMonthDate = createDateOnly(year, month - 11);
  const firstChartYear = firstChartMonthDate.getUTCFullYear();
  const firstChartMonth = firstChartMonthDate.getUTCMonth() + 1;

  const [
    clients,
    monthlySales,
    monthlyHostingPayments,
    chartSales,
    chartHostingPayments,
    recentSales,
    monthlyGoal,
  ] = await Promise.all([
    prisma.client.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        businessName: "asc",
      },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
        saleDate: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
      select: {
        netAmount: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "PAID",
        paidAt: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
      orderBy: {
        paidAt: "desc",
      },
      select: {
        id: true,
        description: true,
        amount: true,
        paidAt: true,
        method: true,
        reference: true,
        client: {
          select: {
            businessName: true,
            tradeName: true,
          },
        },
      },
    }),
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
        saleDate: {
          gte: createDateOnly(firstChartYear, firstChartMonth),
          lt: currentMonth.end,
        },
      },
      select: {
        saleDate: true,
        netAmount: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "PAID",
        paidAt: {
          gte: createDateOnly(firstChartYear, firstChartMonth),
          lt: currentMonth.end,
        },
      },
      select: {
        paidAt: true,
        amount: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        saleDate: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
      orderBy: [
        {
          saleDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 100,
      include: {
        client: {
          select: {
            businessName: true,
            tradeName: true,
            mainContactName: true,
            email: true,
          },
        },
        payments: {
          orderBy: [
            {
              paidAt: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
          include: {
            receipt: true,
            invoice: true,
          },
        },
      },
    }),
    getMonthlySalesGoal(
      year,
      month,
    ),
  ]);

  const manualSalesTotal = monthlySales.reduce(
    (total, sale) => total + Number(sale.netAmount),
    0,
  );

  const hostingSalesTotal =
    monthlyHostingPayments.reduce(
      (total, payment) =>
        total +
        netFromGross(
          Number(payment.amount),
        ),
      0,
    );

  const monthlyTotal =
    manualSalesTotal +
    hostingSalesTotal;

  const salesCount =
    monthlySales.length +
    monthlyHostingPayments.length;

  const averageSale = salesCount > 0 ? monthlyTotal / salesCount : 0;
  const progress = (monthlyTotal / monthlyGoal) * 100;
  const remaining = Math.max(monthlyGoal - monthlyTotal, 0);

  const chartData = Array.from({ length: 12 }, (_, index) => {
    const date = createDateOnly(firstChartYear, firstChartMonth + index);
    const itemYear = date.getUTCFullYear();
    const itemMonth = date.getUTCMonth() + 1;
    const manualTotal = chartSales
      .filter(
        (sale) =>
          sale.saleDate.getUTCFullYear() === itemYear &&
          sale.saleDate.getUTCMonth() + 1 === itemMonth,
      )
      .reduce((sum, sale) => sum + Number(sale.netAmount), 0);

    const hostingTotal =
      chartHostingPayments
        .filter(
          (payment) =>
            payment.paidAt &&
            payment.paidAt.getUTCFullYear() === itemYear &&
            payment.paidAt.getUTCMonth() + 1 === itemMonth,
        )
        .reduce(
          (sum, payment) =>
            sum +
            netFromGross(
              Number(payment.amount),
            ),
          0,
        );

    return {
      key: `${itemYear}-${String(itemMonth).padStart(2, "0")}`,
      label: getMonthLabel(itemYear, itemMonth),
      total:
        manualTotal +
        hostingTotal,
    };
  });

  const chartMaximum =
    Math.max(monthlyGoal, ...chartData.map((item) => item.total)) * 1.12;
  const goalPosition = (monthlyGoal / chartMaximum) * 100;

  const saleItems: SaleListItem[] = recentSales.map((sale) => {
    const netAmount = Number(sale.netAmount);
    const grossAmount = grossFromNet(netAmount);
    const paidAmount = sale.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const balanceAmount = Math.max(grossAmount - paidAmount, 0);
    const financialStatus =
      paidAmount <= 0
        ? ("UNPAID" as const)
        : balanceAmount > 0
          ? ("PARTIAL" as const)
          : ("PAID" as const);

    return {
      id: sale.id,
      number: sale.number,
      clientId: sale.clientId,
      clientName: sale.client.tradeName || sale.client.businessName,
      contactName: sale.client.mainContactName ?? "",
      clientEmail: sale.client.email ?? "",
      service: sale.service,
      saleDate: toDateInputValue(sale.saleDate),
      displayDate: formatDateOnly(sale.saleDate),
      netAmount,
      formattedAmount: formatCurrency(netAmount),
      grossAmount,
      formattedGrossAmount: formatCurrency(grossAmount),
      paidAmount,
      formattedPaidAmount: formatCurrency(paidAmount),
      balanceAmount,
      formattedBalanceAmount: formatCurrency(balanceAmount),
      financialStatus,
      notes: sale.notes ?? "",
      status: sale.status,
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        formattedAmount: formatCurrency(Number(payment.amount)),
        paidAt: toDateInputValue(payment.paidAt),
        displayDate: formatDateOnly(payment.paidAt),
        method: payment.method,
        methodLabel: getPaymentMethodLabel(payment.method),
        reference: payment.reference ?? "",
        notes: payment.notes ?? "",
        receipt: payment.receipt
          ? {
              number: payment.receipt.number,
              recipientName: payment.receipt.recipientName,
              recipientEmail: payment.receipt.recipientEmail,
              serviceDescription: payment.receipt.serviceDescription,
              projectReference: payment.receipt.projectReference ?? "",
              paymentReference: payment.receipt.paymentReference ?? "",
              netAmount: Number(payment.receipt.netAmount),
              taxAmount: Number(payment.receipt.taxAmount),
              totalAmount: Number(payment.receipt.totalAmount),
              balanceAmount: Number(payment.receipt.balanceAmount),
              emailStatus: payment.receipt.emailStatus,
              lastError: payment.receipt.lastError ?? "",
            }
          : null,
        invoice: payment.invoice
          ? {
              invoiceNumber: payment.invoice.invoiceNumber,
              issueDate: toDateInputValue(payment.invoice.issueDate),
              recipientName: payment.invoice.recipientName,
              recipientEmail: payment.invoice.recipientEmail,
              serviceDescription: payment.invoice.serviceDescription,
              netAmount: Number(payment.invoice.netAmount),
              taxAmount: Number(payment.invoice.taxAmount),
              totalAmount: Number(payment.invoice.totalAmount),
              paymentCondition: payment.invoice.paymentCondition ?? "Contado",
              fileName: payment.invoice.fileName,
              emailStatus: payment.invoice.emailStatus,
              lastError: payment.invoice.lastError ?? "",
            }
          : null,
      })),
    };
  });

  return (
    <main className={styles.content}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Gestión comercial</span>
          <h1>Ventas</h1>
          <p>
            Control de ventas cerradas y avance de la meta comercial mensual.
          </p>
        </div>

        <div className={styles.periodTools}>
          <form
            className={styles.periodForm}
            method="get"
          >
            <label>
              <span>Mes de análisis</span>
              <input
                defaultValue={period}
                name="periodo"
                type="month"
              />
            </label>

            <button type="submit">
              Ver mes
            </button>
          </form>

          <form
            action={updateMonthlyGoal}
            className={styles.periodForm}
          >
            <input
              name="period"
              type="hidden"
              value={period}
            />

            <label>
              <span>Meta del mes</span>
              <input
                defaultValue={monthlyGoal}
                min="1"
                name="goal"
                step="1"
                type="number"
              />
            </label>

            <button type="submit">
              Guardar meta
            </button>
          </form>
        </div>
      </header>

      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <span>Vendido en {getMonthLabel(year, month, true)}</span>
          <strong>{formatCurrency(monthlyTotal)}</strong>
          <small>
            {monthlySales.length} ventas y {monthlyHostingPayments.length} pagos de hosting
          </small>
        </article>

        <article className={styles.metricCard}>
          <span>Meta mensual</span>
          <strong>{formatCurrency(monthlyGoal)}</strong>
          <small>Valor neto, sin IVA</small>
        </article>

        <article className={styles.metricCard}>
          <span>Avance de la meta</span>
          <strong>{progress.toFixed(1).replace(".", ",")}%</strong>
          <small>
            {remaining > 0
              ? `Faltan ${formatCurrency(remaining)}`
              : `Meta superada por ${formatCurrency(
                  monthlyTotal - monthlyGoal,
                )}`}
          </small>
        </article>

        <article className={styles.metricCard}>
          <span>Venta promedio</span>
          <strong>{formatCurrency(averageSale)}</strong>
          <small>Promedio de las ventas activas del mes</small>
        </article>
      </section>

      <section className={styles.goalPanel}>
        <div className={styles.goalTopline}>
          <div>
            <span>Progreso mensual</span>
            <strong>{Math.min(progress, 100).toFixed(1).replace(".", ",")}%</strong>
          </div>
          <p>
            {monthlyTotal >= monthlyGoal
              ? "Meta mensual cumplida"
              : `${formatCurrency(remaining)} para alcanzar la meta`}
          </p>
        </div>
        <div className={styles.progressTrack}>
          <span
            className={styles.progressValue}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </section>

      <section className={styles.chartPanel}>
        <div className={styles.chartHeader}>
          <div>
            <span className={styles.eyebrow}>Últimos 12 meses</span>
            <h2>Evolución de ventas</h2>
            <p>Comparación mensual de ventas netas contra la meta comercial.</p>
          </div>
          <div className={styles.chartLegend}>
            <span>
              <i className={styles.legendSales} />
              Ventas
            </span>
            <span>
              <i className={styles.legendGoal} />
              Meta {formatCurrency(monthlyGoal)}
            </span>
          </div>
        </div>

        <div className={styles.chartScroll}>
          <div className={styles.chart}>
            <div
              className={styles.goalLine}
              style={{ bottom: `${goalPosition}%` }}
            >
              <span>Meta</span>
            </div>

            {chartData.map((item) => {
              const height = (item.total / chartMaximum) * 100;

              return (
                <div className={styles.chartColumn} key={item.key}>
                  <div className={styles.barArea}>
                    {item.total > 0 ? (
                      <span className={styles.barValue}>
                        {formatCurrency(item.total)}
                      </span>
                    ) : null}
                    <span
                      className={styles.bar}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={styles.monthLabel}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <span className={styles.eyebrow}>
              Ingresos recurrentes
            </span>
            <h2>Pagos de hosting confirmados</h2>
            <p>
              Estos pagos se incorporan automáticamente al total comercial del mes.
            </p>
          </div>

          <strong className={styles.hostingTotal}>
            {formatCurrency(hostingSalesTotal)} netos
          </strong>
        </div>

        {monthlyHostingPayments.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No hay pagos de hosting confirmados en este mes</strong>
            <p>Cuando un pago pase a pagado aparecerá aquí y sumará en los indicadores.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Medio</th>
                  <th>Total pagado</th>
                  <th>Neto comercial</th>
                </tr>
              </thead>
              <tbody>
                {monthlyHostingPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.paidAt
                        ? formatDateOnly(payment.paidAt)
                        : "Sin fecha"}
                    </td>
                    <td>
                      <strong>
                        {payment.client.tradeName ||
                          payment.client.businessName}
                      </strong>
                    </td>
                    <td>
                      <strong>{payment.description}</strong>
                      {payment.reference ? (
                        <small>{payment.reference}</small>
                      ) : null}
                    </td>
                    <td>
                      {payment.method
                        ? getPaymentMethodLabel(payment.method)
                        : "Sin informar"}
                    </td>
                    <td className={styles.amountCell}>
                      {formatCurrency(Number(payment.amount))}
                    </td>
                    <td className={styles.amountCell}>
                      {formatCurrency(
                        netFromGross(Number(payment.amount)),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.listPanel}>
        <SalesManager
          clients={clients.map((client) => ({
            id: client.id,
            name: client.tradeName || client.businessName,
          }))}
          sales={saleItems}
          today={getChileDateKey()}
        />
      </section>
    </main>
  );
}
