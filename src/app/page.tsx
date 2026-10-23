import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getProspectStatusLabel,
  parseProspectMetadata,
} from "@/lib/prospect";
import { getMonthlySalesGoal } from "@/lib/sales-goal";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const activeProjectStatuses = [
  "DEVELOPMENT",
  "ACTIVE",
  "MAINTENANCE",
] as const;

const actionableRenewalStatuses = [
  "UPCOMING",
  "NOTIFIED",
  "EXPIRED",
] as const;

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

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago",
  })
    .format(date)
    .replace(".", "");
}

function formatDateKey(dateKey: string) {
  return formatDate(new Date(`${dateKey}T12:00:00.000Z`));
}

function formatLongDate(date: Date) {
  const formattedDate = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);

  return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
}

function formatMonthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("es-CL", {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getChileDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function getStartOfDay(date = new Date()) {
  return new Date(`${getChileDateKey(date)}T00:00:00.000Z`);
}

function getChileMonthRange(date: Date) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Santiago",
  }).formatToParts(date);
  const year = Number(
    dateParts.find((part) => part.type === "year")?.value,
  );
  const month = Number(
    dateParts.find((part) => part.type === "month")?.value,
  );

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

function addDateKeyDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDaysDifference(dueDate: Date, today: Date) {
  const dueDateValue = new Date(
    `${getChileDateKey(dueDate)}T00:00:00.000Z`,
  ).getTime();
  const todayValue = new Date(
    `${getChileDateKey(today)}T00:00:00.000Z`,
  ).getTime();

  return Math.round((dueDateValue - todayValue) / 86_400_000);
}

function getDeadlineLabel(days: number) {
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return overdueDays === 1
      ? "Vencida hace 1 día"
      : `Vencida hace ${overdueDays} días`;
  }

  if (days === 0) {
    return "Vence hoy";
  }

  if (days === 1) {
    return "Vence mañana";
  }

  return `En ${days} días`;
}

function getFollowUpLabel(dateKey: string, todayKey: string) {
  if (dateKey < todayKey) {
    return "Atrasado";
  }

  if (dateKey === todayKey) {
    return "Hoy";
  }

  if (dateKey === addDateKeyDays(todayKey, 1)) {
    return "Mañana";
  }

  return formatDateKey(dateKey);
}

function getUrgencyClass(days: number) {
  if (days < 0) {
    return styles.urgencyExpired;
  }

  if (days <= 7) {
    return styles.urgencyFinal;
  }

  return styles.urgencyUpcoming;
}

export default async function Home() {
  const currentDate = new Date();
  const today = getStartOfDay(currentDate);
  const todayKey = getChileDateKey(currentDate);
  const nextSevenDaysKey = addDateKeyDays(todayKey, 7);
  const nextThirtyDaysKey = addDateKeyDays(todayKey, 30);
  const nextThirtyDays = addDays(today, 30);
  const currentMonth = getChileMonthRange(currentDate);
  const trendStart = new Date(
    Date.UTC(
      currentMonth.start.getUTCFullYear(),
      currentMonth.start.getUTCMonth() - 5,
      1,
    ),
  );
  const activeRenewalScope = {
    status: {
      in: [...actionableRenewalStatuses],
    },
    client: {
      status: "ACTIVE" as const,
    },
    OR: [
      { projectId: null },
      {
        project: {
          status: {
            in: [...activeProjectStatuses],
          },
        },
      },
    ],
  };

  const [
    clientCount,
    projectCount,
    openRequestCount,
    upcomingRenewalCount,
    overdueRenewalCount,
    pendingPaymentCount,
    pendingPaymentAmountResult,
    prospectLogs,
    priorityRenewals,
    monthlySalesAmountResult,
    monthlySalesCount,
    monthlyHostingAmountResult,
    monthlyHostingCount,
    monthlySalesTarget,
    recentSales,
    trendSales,
    trendHostingPayments,
  ] = await Promise.all([
    prisma.client.count({
      where: { status: "ACTIVE" },
    }),
    prisma.project.count({
      where: {
        status: { in: [...activeProjectStatuses] },
        client: { status: "ACTIVE" },
      },
    }),
    prisma.supportRequest.count({
      where: {
        status: {
          notIn: ["COMPLETED", "REJECTED", "OUT_OF_SCOPE"],
        },
        OR: [
          { clientId: null },
          { client: { status: "ACTIVE" } },
        ],
      },
    }),
    prisma.renewal.count({
      where: {
        ...activeRenewalScope,
        dueDate: { gte: today, lte: nextThirtyDays },
      },
    }),
    prisma.renewal.count({
      where: {
        ...activeRenewalScope,
        dueDate: { lt: today },
      },
    }),
    prisma.payment.count({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        client: { status: "ACTIVE" },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        client: { status: "ACTIVE" },
      },
      _sum: { amount: true },
    }),
    prisma.activityLog.findMany({
      where: { entityType: "Prospect" },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.renewal.findMany({
      where: {
        ...activeRenewalScope,
        dueDate: { lte: nextThirtyDays },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        client: {
          select: {
            businessName: true,
            tradeName: true,
          },
        },
        project: {
          select: {
            name: true,
            domain: true,
          },
        },
      },
    }),
    prisma.sale.aggregate({
      where: {
        status: "ACTIVE",
        saleDate: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
      _sum: { netAmount: true },
    }),
    prisma.sale.count({
      where: {
        status: "ACTIVE",
        saleDate: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: "PAID",
        paidAt: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: {
        status: "PAID",
        paidAt: {
          gte: currentMonth.start,
          lt: currentMonth.end,
        },
      },
    }),
    getMonthlySalesGoal(
      currentMonth.start.getUTCFullYear(),
      currentMonth.start.getUTCMonth() + 1,
    ),
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
        client: { status: "ACTIVE" },
      },
      orderBy: [
        { saleDate: "desc" },
        { createdAt: "desc" },
      ],
      take: 5,
      include: {
        client: {
          select: {
            businessName: true,
            tradeName: true,
          },
        },
        payments: {
          select: { amount: true },
        },
      },
    }),
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
        saleDate: {
          gte: trendStart,
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
          gte: trendStart,
          lt: currentMonth.end,
        },
      },
      select: {
        paidAt: true,
        amount: true,
      },
    }),
  ]);

  const prospects = prospectLogs
    .map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      metadata: parseProspectMetadata(log.metadata),
    }))
    .filter(
      (
        item,
      ): item is typeof item & {
        metadata: NonNullable<typeof item.metadata>;
      } => Boolean(item.metadata),
    );
  const openProspects = prospects.filter(
    ({ metadata }) =>
      metadata.status !== "WON" && metadata.status !== "LOST",
  );
  const datedProspects = openProspects
    .filter(({ metadata }) => Boolean(metadata.nextFollowUp))
    .sort((first, second) =>
      first.metadata.nextFollowUp.localeCompare(
        second.metadata.nextFollowUp,
      ),
    );
  const overdueFollowUps = datedProspects.filter(
    ({ metadata }) => metadata.nextFollowUp < todayKey,
  );
  const immediateFollowUps = datedProspects.filter(
    ({ metadata }) =>
      metadata.nextFollowUp >= todayKey &&
      metadata.nextFollowUp <= nextSevenDaysKey,
  );
  const undatedFollowUps = openProspects.filter(
    ({ metadata }) => !metadata.nextFollowUp,
  ).length;
  const agendaProspects = datedProspects
    .filter(
      ({ metadata }) => metadata.nextFollowUp <= nextThirtyDaysKey,
    )
    .slice(0, 6);
  const pendingPaymentAmount = Number(
    pendingPaymentAmountResult._sum.amount ?? 0,
  );
  const monthlyDirectSalesAmount = Number(
    monthlySalesAmountResult._sum.netAmount ?? 0,
  );
  const monthlyHostingSalesAmount = Math.round(
    Number(monthlyHostingAmountResult._sum.amount ?? 0) / 1.19,
  );
  const monthlySalesAmount =
    monthlyDirectSalesAmount + monthlyHostingSalesAmount;
  const monthlyCommercialCount = monthlySalesCount + monthlyHostingCount;
  const monthlySalesProgress =
    monthlySalesTarget > 0
      ? Math.round((monthlySalesAmount / monthlySalesTarget) * 100)
      : 0;
  const monthlySalesRemaining = Math.max(
    monthlySalesTarget - monthlySalesAmount,
    0,
  );
  const salesTrend = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(
        trendStart.getUTCFullYear(),
        trendStart.getUTCMonth() + index,
        1,
      ),
    );
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth();
    const directSales = trendSales
      .filter(
        (sale) =>
          sale.saleDate.getUTCFullYear() === year &&
          sale.saleDate.getUTCMonth() === month,
      )
      .reduce((total, sale) => total + Number(sale.netAmount), 0);
    const hostingSales = trendHostingPayments
      .filter(
        (payment) =>
          payment.paidAt?.getUTCFullYear() === year &&
          payment.paidAt?.getUTCMonth() === month,
      )
      .reduce(
        (total, payment) =>
          total + Math.round(Number(payment.amount) / 1.19),
        0,
      );

    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: formatMonthLabel(monthDate),
      total: directSales + hostingSales,
    };
  });
  const salesTrendMaximum = Math.max(
    1,
    ...salesTrend.map((item) => item.total),
  );
  const agendaCount = overdueFollowUps.length + immediateFollowUps.length;
  const metrics = [
    {
      label: "Clientes activos",
      value: String(clientCount),
      detail: `${projectCount} proyectos vigentes`,
      href: "/clientes",
      alert: false,
    },
    {
      label: "Agenda comercial",
      value: String(agendaCount),
      detail: `${overdueFollowUps.length} atrasados · ${immediateFollowUps.length} próximos`,
      href: "/seguimiento",
      alert: overdueFollowUps.length > 0,
    },
    {
      label: "Solicitudes abiertas",
      value: String(openRequestCount),
      detail: "Pendientes de resolución",
      href: "/solicitudes",
      alert: openRequestCount > 0,
    },
    {
      label: "Cobros pendientes",
      value: formatCurrency(pendingPaymentAmount),
      detail: `${pendingPaymentCount} cobro${pendingPaymentCount === 1 ? "" : "s"} activo${pendingPaymentCount === 1 ? "" : "s"}`,
      href: "/pagos",
      alert: pendingPaymentCount > 0,
    },
  ];

  return (
    <main className={styles.content}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Control comercial</span>
          <h1>Dashboard</h1>
          <p>
            Prioridades reales para vender, cobrar y renovar sin recorrer
            todo el sistema.
          </p>
          <span className={styles.currentDate}>
            {formatLongDate(currentDate)}
          </span>
        </div>

        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/cotizaciones">
            Nueva cotización
          </Link>
          <Link className={styles.primaryButton} href="/seguimiento">
            Abrir agenda
          </Link>
        </div>
      </header>

      <section aria-label="Indicadores principales" className={styles.metrics}>
        {metrics.map((metric) => (
          <Link
            className={`${styles.metricCard} ${
              metric.alert ? styles.metricCardAlert : ""
            }`}
            href={metric.href}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </Link>
        ))}
      </section>

      <section className={styles.focusGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>Próximas acciones</span>
              <h2>Agenda comercial</h2>
              <p>Contactos vencidos y programados para los próximos 30 días.</p>
            </div>
            <Link className={styles.textAction} href="/seguimiento">
              Ver calendario →
            </Link>
          </div>

          {agendaProspects.length === 0 ? (
            <div className={styles.emptyState}>
              <span>✓</span>
              <div>
                <h3>Agenda al día</h3>
                <p>No hay seguimientos vencidos ni próximos.</p>
              </div>
            </div>
          ) : (
            <div className={styles.agendaList}>
              {agendaProspects.map(({ id, metadata }) => {
                const quotation = metadata.quotations[0];
                const isOverdue = metadata.nextFollowUp < todayKey;

                return (
                  <Link
                    className={styles.agendaItem}
                    href={`/seguimiento#prospect-${id}`}
                    key={id}
                  >
                    <span
                      className={`${styles.agendaDate} ${
                        isOverdue ? styles.agendaDateOverdue : ""
                      }`}
                    >
                      {getFollowUpLabel(metadata.nextFollowUp, todayKey)}
                    </span>

                    <span className={styles.agendaMain}>
                      <strong>{metadata.company}</strong>
                      <small>
                        {metadata.contactName || "Contacto sin definir"}
                        {metadata.interest ? ` · ${metadata.interest}` : ""}
                      </small>
                    </span>

                    <span className={styles.agendaContext}>
                      <small>{getProspectStatusLabel(metadata.status)}</small>
                      {quotation ? (
                        <strong>
                          {quotation.number} · {formatCurrency(quotation.totalAmount)}
                        </strong>
                      ) : (
                        <strong>{metadata.assignedTo || "Sin responsable"}</strong>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </article>

        <aside className={`${styles.panel} ${styles.controlPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>Control del día</span>
              <h2>Alertas clave</h2>
            </div>
          </div>

          <div className={styles.alertList}>
            <Link
              className={overdueFollowUps.length > 0 ? styles.alertCritical : ""}
              href="/seguimiento"
            >
              <span>Seguimientos atrasados</span>
              <strong>{overdueFollowUps.length}</strong>
            </Link>
            <Link
              className={overdueRenewalCount > 0 ? styles.alertCritical : ""}
              href="/renovaciones"
            >
              <span>Renovaciones vencidas</span>
              <strong>{overdueRenewalCount}</strong>
            </Link>
            <Link href="/renovaciones">
              <span>Vencen en 30 días</span>
              <strong>{upcomingRenewalCount}</strong>
            </Link>
            <Link href="/pagos">
              <span>Cobros por gestionar</span>
              <strong>{pendingPaymentCount}</strong>
            </Link>
          </div>

          {undatedFollowUps > 0 && (
            <Link className={styles.dataWarning} href="/seguimiento">
              <strong>{undatedFollowUps} oportunidades sin próxima fecha</strong>
              <span>Ordénalas para que no queden fuera de la agenda.</span>
            </Link>
          )}
        </aside>
      </section>

      <section className={styles.performanceGrid}>
        <article className={styles.goalPanel}>
          <div className={styles.goalHeader}>
            <div>
              <span className={styles.panelEyebrow}>Mes actual</span>
              <h2>Meta comercial</h2>
            </div>
            <strong>{monthlySalesProgress}%</strong>
          </div>

          <div className={styles.goalAmount}>
            <strong>{formatCurrency(monthlySalesAmount)}</strong>
            <span>de {formatCurrency(monthlySalesTarget)}</span>
          </div>
          <div
            aria-label={`${monthlySalesProgress}% de la meta mensual alcanzada`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.min(monthlySalesProgress, 100)}
            className={styles.progressTrack}
            role="progressbar"
          >
            <span
              className={styles.progressValue}
              style={{ width: `${Math.min(monthlySalesProgress, 100)}%` }}
            />
          </div>
          <div className={styles.goalFooter}>
            <span>{monthlyCommercialCount} movimientos confirmados</span>
            <strong>
              {monthlySalesRemaining > 0
                ? `${formatCurrency(monthlySalesRemaining)} pendientes`
                : "Meta cumplida"}
            </strong>
          </div>
        </article>

        <article className={styles.trendPanel}>
          <div className={styles.trendHeader}>
            <div>
              <span className={styles.panelEyebrow}>Últimos 6 meses</span>
              <h2>Evolución de ventas</h2>
            </div>
            <Link className={styles.textAction} href="/ventas">
              Ver ventas →
            </Link>
          </div>

          <div className={styles.trendChart}>
            {salesTrend.map((item) => {
              const height =
                item.total > 0
                  ? Math.max(8, (item.total / salesTrendMaximum) * 100)
                  : 0;

              return (
                <div
                  aria-label={`${item.label}: ${formatCurrency(item.total)}`}
                  className={styles.trendColumn}
                  key={item.key}
                >
                  <span>{formatCurrency(item.total)}</span>
                  <div className={styles.trendTrack}>
                    <i style={{ height: `${height}%` }} />
                  </div>
                  <strong>{item.label}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className={styles.activityGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>Servicios activos</span>
              <h2>Renovaciones prioritarias</h2>
              <p>Sólo clientes y proyectos que continúan vigentes.</p>
            </div>
            <Link className={styles.textAction} href="/renovaciones">
              Ver todas →
            </Link>
          </div>

          {priorityRenewals.length === 0 ? (
            <div className={styles.emptyState}>
              <span>✓</span>
              <div>
                <h3>Sin renovaciones urgentes</h3>
                <p>No hay vencimientos activos durante los próximos 30 días.</p>
              </div>
            </div>
          ) : (
            <div className={styles.priorityList}>
              {priorityRenewals.map((renewal) => {
                const days = getDaysDifference(renewal.dueDate, currentDate);
                const service =
                  renewal.project?.domain ||
                  renewal.project?.name ||
                  renewal.description;

                return (
                  <Link
                    className={styles.priorityItem}
                    href={`/clientes/${renewal.clientId}`}
                    key={renewal.id}
                  >
                    <span className={styles.priorityMain}>
                      <span className={styles.priorityTopline}>
                        <strong>
                          {renewal.client.tradeName ||
                            renewal.client.businessName}
                        </strong>
                        <small
                          className={`${styles.urgencyBadge} ${getUrgencyClass(
                            days,
                          )}`}
                        >
                          {getDeadlineLabel(days)}
                        </small>
                      </span>
                      <span>{service}</span>
                      <small>{formatDate(renewal.dueDate)}</small>
                    </span>
                    <strong className={styles.priorityAmount}>
                      {formatCurrency(renewal.amount)}
                    </strong>
                  </Link>
                );
              })}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>Actividad comercial</span>
              <h2>Ventas recientes</h2>
              <p>Últimas ventas vigentes de clientes activos.</p>
            </div>
            <Link className={styles.textAction} href="/ventas">
              Ver todas →
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className={styles.emptyState}>
              <span>—</span>
              <div>
                <h3>Sin ventas recientes</h3>
                <p>Las nuevas ventas aparecerán aquí.</p>
              </div>
            </div>
          ) : (
            <div className={styles.saleList}>
              {recentSales.map((sale) => {
                const paidAmount = sale.payments.reduce(
                  (total, payment) => total + Number(payment.amount),
                  0,
                );
                const balance = Math.max(Number(sale.netAmount) - paidAmount, 0);

                return (
                  <Link
                    className={styles.saleItem}
                    href={`/clientes/${sale.clientId}`}
                    key={sale.id}
                  >
                    <span className={styles.saleMain}>
                      <strong>
                        {sale.client.tradeName || sale.client.businessName}
                      </strong>
                      <span>{sale.service}</span>
                      <small>
                        Venta #{sale.number} · {formatDate(sale.saleDate)}
                      </small>
                    </span>
                    <span className={styles.saleAmount}>
                      <strong>{formatCurrency(sale.netAmount)}</strong>
                      <small>
                        {balance > 0
                          ? `${formatCurrency(balance)} pendientes`
                          : "Pagada"}
                      </small>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
