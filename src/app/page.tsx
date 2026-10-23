import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getMonthlySalesGoal } from "@/lib/sales-goal";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatCurrency(
  value: unknown,
) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "$0";
  }

  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(amount);
}

function formatDate(
  date: Date | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function formatLongDate(
  date: Date,
) {
  const formattedDate =
    new Intl.DateTimeFormat(
      "es-CL",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone:
          "America/Santiago",
      },
    ).format(date);

  return (
    formattedDate
      .charAt(0)
      .toUpperCase() +
    formattedDate.slice(1)
  );
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

function getChileDateKey(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function getStartOfDay(
  date = new Date(),
) {
  return new Date(
    `${getChileDateKey(
      date,
    )}T00:00:00.000Z`,
  );
}

function getChileMonthRange(
  date: Date,
) {
  const dateParts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        year: "numeric",
        month: "2-digit",
        timeZone:
          "America/Santiago",
      },
    ).formatToParts(date);

  const year = Number(
    dateParts.find(
      (part) =>
        part.type === "year",
    )?.value,
  );

  const month = Number(
    dateParts.find(
      (part) =>
        part.type === "month",
    )?.value,
  );

  return {
    start: new Date(
      Date.UTC(
        year,
        month - 1,
        1,
      ),
    ),
    end: new Date(
      Date.UTC(year, month, 1),
    ),
  };
}

function addDays(
  date: Date,
  days: number,
) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + days,
  );

  result.setHours(
    23,
    59,
    59,
    999,
  );

  return result;
}

function getDaysDifference(
  dueDate: Date,
  today: Date,
) {
  const dueDateValue =
    new Date(
      `${getChileDateKey(
        dueDate,
      )}T00:00:00.000Z`,
    ).getTime();

  const todayValue =
    new Date(
      `${getChileDateKey(
        today,
      )}T00:00:00.000Z`,
    ).getTime();

  return Math.round(
    (dueDateValue -
      todayValue) /
      (1000 * 60 * 60 * 24),
  );
}

function getDeadlineLabel(
  days: number,
) {
  if (days < 0) {
    const overdueDays =
      Math.abs(days);

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

  return `Faltan ${days} días`;
}

function getReminderLabel(
  days: number,
) {
  if (days < 0) {
    return "Seguimiento vencido";
  }

  if (days <= 7) {
    return "Recordatorio final";
  }

  if (days <= 15) {
    return "Segundo recordatorio";
  }

  return "Primer aviso";
}

function getUrgencyClass(
  days: number,
) {
  if (days < 0) {
    return styles.urgencyExpired;
  }

  if (days <= 7) {
    return styles.urgencyFinal;
  }

  if (days <= 15) {
    return styles.urgencySecond;
  }

  return styles.urgencyFirst;
}

export default async function Home() {
  const currentDate = new Date();
  const today =
    getStartOfDay(currentDate);

  const nextThirtyDays =
    addDays(today, 30);

  const currentMonth =
    getChileMonthRange(
      currentDate,
    );

  const trendStart = new Date(
    Date.UTC(
      currentMonth.start.getUTCFullYear(),
      currentMonth.start.getUTCMonth() - 5,
      1,
    ),
  );

  const [
    clientCount,
    projectCount,
    openRequestCount,
    upcomingRenewalCount,
    overdueRenewalCount,
    pendingPaymentCount,
    pendingPaymentAmountResult,
    plans,
    priorityRenewals,
    recentPaidCandidates,
    monthlySalesAmountResult,
    monthlySalesCount,
    monthlyHostingAmountResult,
    monthlyHostingCount,
    monthlySalesTarget,
    recentSales,
    recentManualCharges,
    trendSales,
    trendHostingPayments,
  ] = await Promise.all([
    prisma.client.count({
      where: {
        status: "ACTIVE",
      },
    }),

    prisma.project.count({
      where: {
        status: {
          in: [
            "DEVELOPMENT",
            "ACTIVE",
            "MAINTENANCE",
          ],
        },
      },
    }),

    prisma.supportRequest.count({
      where: {
        status: {
          notIn: [
            "COMPLETED",
            "REJECTED",
            "OUT_OF_SCOPE",
          ],
        },
      },
    }),

    prisma.renewal.count({
      where: {
        dueDate: {
          gte: today,
          lte: nextThirtyDays,
        },
        status: {
          in: [
            "UPCOMING",
            "NOTIFIED",
            "EXPIRED",
          ],
        },
      },
    }),

    prisma.renewal.count({
      where: {
        dueDate: {
          lt: today,
        },
        status: {
          in: [
            "UPCOMING",
            "NOTIFIED",
            "EXPIRED",
          ],
        },
      },
    }),

    prisma.payment.count({
      where: {
        status: {
          in: [
            "PENDING",
            "OVERDUE",
          ],
        },
      },
    }),

    prisma.payment.aggregate({
      where: {
        status: {
          in: [
            "PENDING",
            "OVERDUE",
          ],
        },
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.plan.findMany({
      where: {
        active: true,
      },
      orderBy: {
        monthlyPrice: "asc",
      },
    }),

    prisma.renewal.findMany({
      where: {
        dueDate: {
          lte: nextThirtyDays,
        },
        status: {
          in: [
            "UPCOMING",
            "NOTIFIED",
            "EXPIRED",
          ],
        },
      },
      orderBy: {
        dueDate: "asc",
      },
      take: 8,
      include: {
        client: true,
        project: true,
        notifications: {
          orderBy: {
            sentAt: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            notifications: true,
          },
        },
      },
    }),

    prisma.payment.findMany({
      where: {
        status: "PAID",
      },
      orderBy: {
        paidAt: "desc",
      },
      take: 12,
      include: {
        client: true,
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
      _sum: {
        netAmount: true,
      },
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
      _sum: {
        amount: true,
      },
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
      },
      orderBy: [
        {
          saleDate: "desc",
        },
        {
          createdAt: "desc",
        },
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
          select: {
            amount: true,
          },
        },
      },
    }),

    prisma.manualCharge.findMany({
      where: {
        status: {
          in: [
            "PENDING",
            "SENT",
            "ERROR",
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      include: {
        sale: {
          include: {
            client: {
              select: {
                businessName: true,
                tradeName: true,
              },
            },
          },
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

  const pendingPaymentAmount =
    Number(
      pendingPaymentAmountResult
        ._sum.amount ?? 0,
    );

  const recentPayments =
    recentPaidCandidates
      .filter(
        (payment) =>
          !payment.notes?.includes(
            "[PRUEBA]",
          ),
      )
      .slice(0, 5);

  const priorityTaskCount =
    overdueRenewalCount +
    upcomingRenewalCount +
    pendingPaymentCount;

  const monthlyDirectSalesAmount =
    Number(
      monthlySalesAmountResult
        ._sum.netAmount ?? 0,
    );

  const monthlyHostingSalesAmount =
    Math.round(
      Number(
        monthlyHostingAmountResult
          ._sum.amount ?? 0,
      ) / 1.19,
    );

  const monthlySalesAmount =
    monthlyDirectSalesAmount +
    monthlyHostingSalesAmount;

  const monthlyCommercialCount =
    monthlySalesCount +
    monthlyHostingCount;

  const monthlySalesProgress =
    Math.round(
      (monthlySalesAmount /
        monthlySalesTarget) *
        100,
    );

  const monthlySalesRemaining =
    Math.max(
      monthlySalesTarget -
        monthlySalesAmount,
      0,
    );

  const salesTrend = Array.from(
    { length: 6 },
    (_, index) => {
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
        .reduce(
          (total, sale) => total + Number(sale.netAmount),
          0,
        );
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
    },
  );

  const salesTrendMaximum = Math.max(
    1,
    ...salesTrend.map((item) => item.total),
  );

  const metrics = [
    {
      label: "Clientes activos",
      value: clientCount,
      detail:
        "Empresas con servicios vigentes",
      href: "/clientes",
      alert: false,
    },
    {
      label: "Proyectos activos",
      value: projectCount,
      detail:
        "Sitios en desarrollo o mantención",
      href: "/proyectos",
      alert: false,
    },
    {
      label: "Solicitudes abiertas",
      value: openRequestCount,
      detail:
        "Tickets pendientes de resolución",
      href: "/solicitudes",
      alert:
        openRequestCount > 0,
    },
    {
      label: "Trabajo pendiente",
      value: priorityTaskCount,
      detail:
        "Renovaciones y cobros por gestionar",
      href: "/renovaciones",
      alert:
        priorityTaskCount > 0,
    },
  ];

  const businessFlow = [
    {
      step: "01",
      title: "Captar",
      module: "Seguimiento comercial",
      detail: "Prospectos y próximo contacto",
      href: "/seguimiento",
    },
    {
      step: "02",
      title: "Cotizar",
      module: "Cotizaciones",
      detail: "Propuesta, envío y aprobación",
      href: "/cotizaciones",
    },
    {
      step: "03",
      title: "Activar",
      module: "Ventas y clientes",
      detail: "Venta, alta y proyecto",
      href: "/ventas",
    },
    {
      step: "04",
      title: "Retener",
      module: "Servicio recurrente",
      detail: "Soporte, pago y renovación",
      href: "/renovaciones",
    },
  ];

  return (
    <main className={styles.content}>
      <header className={styles.header}>
        <div>
          <span
            className={styles.eyebrow}
          >
            Panel administrativo
          </span>

          <h1>Dashboard</h1>

          <p>
            Control diario de clientes,
            renovaciones, cobros y actividad
            operativa de Vialoop.
          </p>

          <span
            className={
              styles.currentDate
            }
          >
            {formatLongDate(
              currentDate,
            )}
          </span>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={
              styles.secondaryButton
            }
            href="/ventas"
          >
            Registrar venta
          </Link>

          <Link
            className={
              styles.primaryButton
            }
            href="/clientes/nuevo"
          >
            Nuevo cliente
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="business-flow-title"
        className={styles.processPanel}
      >
        <div className={styles.processHeader}>
          <div>
            <span className={styles.panelEyebrow}>Flujo operativo</span>
            <h2 id="business-flow-title">Del prospecto a la renovación</h2>
          </div>

          <p>
            Cada módulo ocupa una etapa definida para evitar duplicidad y
            mantener la trazabilidad comercial.
          </p>
        </div>

        <div className={styles.processGrid}>
          {businessFlow.map((stage, index) => (
            <Link className={styles.processStep} href={stage.href} key={stage.step}>
              <span className={styles.processNumber}>{stage.step}</span>

              <span className={styles.processCopy}>
                <strong>{stage.title}</strong>
                <span>{stage.module}</span>
                <small>{stage.detail}</small>
              </span>

              {index < businessFlow.length - 1 && (
                <span aria-hidden="true" className={styles.processArrow}>
                  →
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.metrics}>
        {metrics.map((metric) => (
          <Link
            className={`${
              styles.metricCard
            } ${
              metric.alert
                ? styles.metricCardAlert
                : ""
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

      <section className={styles.goalPanel}>
        <div className={styles.goalHeader}>
          <div>
            <span className={styles.panelEyebrow}>Rendimiento comercial</span>
            <h2>Meta mensual</h2>
          </div>

          <div className={styles.goalSummary}>
            <strong>{monthlySalesProgress}%</strong>
            <span>{monthlyCommercialCount} movimientos confirmados</span>
          </div>
        </div>

        <div className={styles.salesOverview}>
          <div>
            <span>Vendido</span>
            <strong>{formatCurrency(monthlySalesAmount)}</strong>
          </div>

          <div>
            <span>Objetivo neto</span>
            <strong>{formatCurrency(monthlySalesTarget)}</strong>
          </div>

          <div>
            <span>{monthlySalesRemaining > 0 ? "Pendiente" : "Resultado"}</span>
            <strong>
              {monthlySalesRemaining > 0
                ? formatCurrency(monthlySalesRemaining)
                : "Meta cumplida"}
            </strong>
          </div>
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

        <div className={styles.progressLabels}>
          <span>{monthlySalesCount} ventas</span>
          <span>{monthlyHostingCount} pagos de hosting</span>
        </div>
      </section>

      <section aria-labelledby="sales-trend-title" className={styles.trendPanel}>
        <div className={styles.trendHeader}>
          <div>
            <span className={styles.panelEyebrow}>Evolución comercial</span>
            <h2 id="sales-trend-title">Ventas de los últimos 6 meses</h2>
            <p>Ventas directas y pagos de hosting confirmados, expresados en valores netos.</p>
          </div>

          <Link className={styles.secondaryButton} href="/ventas">
            Ver análisis completo
          </Link>
        </div>

        <div className={styles.trendChart}>
          {salesTrend.map((item) => {
            const height = item.total > 0
              ? Math.max(6, (item.total / salesTrendMaximum) * 100)
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
      </section>

      <section
        className={
          styles.operationsGrid
        }
      >
        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Trabajo diario
              </span>

              <h2>
                Renovaciones prioritarias
              </h2>

              <p>
                Servicios vencidos o con
                vencimiento durante los
                próximos 30 días.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/renovaciones"
            >
              Ver todas
            </Link>
          </div>

          {priorityRenewals.length ===
          0 ? (
            <div
              className={
                styles.emptyState
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                ✓
              </div>

              <h3>
                No existen renovaciones
                urgentes
              </h3>

              <p>
                No hay servicios vencidos
                ni renovaciones próximas
                durante los siguientes 30
                días.
              </p>
            </div>
          ) : (
            <div
              className={
                styles.priorityList
              }
            >
              {priorityRenewals.map(
                (renewal) => {
                  const days =
                    getDaysDifference(
                      renewal.dueDate,
                      currentDate,
                    );

                  const domain =
                    renewal.project
                      ?.domain ??
                    renewal.project
                      ?.name ??
                    renewal.description;

                  const latestNotification =
                    renewal
                      .notifications[0] ??
                    null;

                  return (
                    <article
                      className={
                        styles.priorityItem
                      }
                      key={renewal.id}
                    >
                      <div
                        className={
                          styles.priorityMain
                        }
                      >
                        <div
                          className={
                            styles.priorityTopline
                          }
                        >
                          <Link
                            className={
                              styles.priorityClient
                            }
                            href={`/clientes/${renewal.clientId}`}
                          >
                            {
                              renewal
                                .client
                                .businessName
                            }
                          </Link>

                          <span
                            className={`${
                              styles.urgencyBadge
                            } ${getUrgencyClass(
                              days,
                            )}`}
                          >
                            {getReminderLabel(
                              days,
                            )}
                          </span>
                        </div>

                        <strong
                          className={
                            styles.priorityDomain
                          }
                        >
                          {domain}
                        </strong>

                        <div
                          className={
                            styles.priorityMeta
                          }
                        >
                          <span>
                            {formatDate(
                              renewal.dueDate,
                            )}
                          </span>

                          <span>
                            {getDeadlineLabel(
                              days,
                            )}
                          </span>

                          <span>
                            {
                              renewal._count
                                .notifications
                            }{" "}
                            {renewal._count
                              .notifications ===
                            1
                              ? "aviso"
                              : "avisos"}
                          </span>

                          {latestNotification && (
                            <span>
                              Último aviso:{" "}
                              {formatDate(
                                latestNotification.sentAt,
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={
                          styles.priorityAside
                        }
                      >
                        <strong
                          className={
                            styles.priorityAmount
                          }
                        >
                          {formatCurrency(
                            renewal.amount,
                          )}
                        </strong>

                        <Link
                          className={
                            styles.inlineAction
                          }
                          href="/renovaciones"
                        >
                          Gestionar
                        </Link>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Estado financiero
              </span>

              <h2>
                Cobros y vencimientos
              </h2>

              <p>
                Resumen de obligaciones
                pendientes de gestión.
              </p>
            </div>
          </div>

          <div
            className={
              styles.operationalList
            }
          >
            <Link
              className={`${
                styles.operationalItem
              } ${
                overdueRenewalCount >
                0
                  ? styles.operationalAlert
                  : ""
              }`}
              href="/renovaciones?filtro=vencidas"
            >
              <div>
                <strong>
                  Renovaciones vencidas
                </strong>

                <span>
                  Requieren seguimiento
                  inmediato
                </span>
              </div>

              <strong>
                {overdueRenewalCount}
              </strong>
            </Link>

            <Link
              className={
                styles.operationalItem
              }
              href="/renovaciones?filtro=30"
            >
              <div>
                <strong>
                  Próximos 30 días
                </strong>

                <span>
                  Servicios próximos a
                  vencer
                </span>
              </div>

              <strong>
                {upcomingRenewalCount}
              </strong>
            </Link>

            <Link
              className={
                styles.operationalItem
              }
              href="/pagos?filtro=pendientes"
            >
              <div>
                <strong>
                  Cobros pendientes
                </strong>

                <span>
                  {pendingPaymentCount}{" "}
                  operaciones abiertas
                </span>
              </div>

              <strong
                className={
                  styles.operationalAmount
                }
              >
                {formatCurrency(
                  pendingPaymentAmount,
                )}
              </strong>
            </Link>

            <Link
              className={
                styles.operationalItem
              }
              href="/ventas"
            >
              <div>
                <strong>
                  Ventas del mes
                </strong>

                <span>
                  {monthlySalesCount}{" "}
                  {monthlySalesCount === 1
                    ? "venta"
                    : "ventas"}{" "}
                  ·{" "}
                  {monthlySalesProgress}%
                  de la meta ·{" "}
                  {monthlySalesRemaining >
                  0
                    ? `Faltan ${formatCurrency(
                        monthlySalesRemaining,
                      )}`
                    : "Meta cumplida"}
                </span>
              </div>

              <strong
                className={
                  styles.operationalAmount
                }
              >
                {formatCurrency(
                  monthlySalesAmount,
                )}
              </strong>
            </Link>
          </div>

          <div
            className={
              styles.panelFooter
            }
          >
            <Link
              className={
                styles.secondaryButton
              }
              href="/pagos"
            >
              Revisar pagos
            </Link>

            <Link
              className={
                styles.secondaryButton
              }
              href="/ventas"
            >
              Revisar ventas
            </Link>
          </div>
        </article>
      </section>

      <section
        className={styles.lowerGrid}
      >
        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Gestión comercial
              </span>

              <h2>Ventas recientes</h2>

              <p>
                Últimas ventas activas,
                abonos registrados y saldo
                pendiente.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/ventas"
            >
              Gestionar ventas
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div
              className={
                styles.emptyState
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                $
              </div>

              <h3>
                No hay ventas registradas
              </h3>

              <p>
                Las nuevas ventas
                aparecerán aquí con sus
                abonos y saldo pendiente.
              </p>
            </div>
          ) : (
            <div
              className={
                styles.recentList
              }
            >
              {recentSales.map(
                (sale) => {
                  const paidAmount =
                    sale.payments.reduce(
                      (
                        total,
                        payment,
                      ) =>
                        total +
                        Number(
                          payment.amount,
                        ),
                      0,
                    );

                  const pendingAmount =
                    Math.max(
                      Number(
                        sale.netAmount,
                      ) -
                        paidAmount,
                      0,
                    );

                  return (
                    <Link
                      className={
                        styles.recentItem
                      }
                      href="/ventas"
                      key={sale.id}
                    >
                      <div>
                        <strong>
                          {sale.client
                            .tradeName ||
                            sale.client
                              .businessName}
                        </strong>

                        <span>
                          Venta N.º{" "}
                          {sale.number} ·{" "}
                          {sale.service}
                        </span>

                        <small>
                          Pagado:{" "}
                          {formatCurrency(
                            paidAmount,
                          )}{" "}
                          · Saldo:{" "}
                          {formatCurrency(
                            pendingAmount,
                          )}
                        </small>
                      </div>

                      <strong
                        className={
                          styles.paymentAmount
                        }
                      >
                        {formatCurrency(
                          sale.netAmount,
                        )}
                      </strong>
                    </Link>
                  );
                },
              )}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Solicitudes manuales
              </span>

              <h2>Próximos cobros</h2>

              <p>
                Cobros creados manualmente
                para ventas y saldos
                pendientes.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/cobros"
            >
              Gestionar cobros
            </Link>
          </div>

          {recentManualCharges.length ===
          0 ? (
            <div
              className={
                styles.emptyState
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                ✓
              </div>

              <h3>
                No hay cobros manuales
                pendientes
              </h3>

              <p>
                Los cobros por
                transferencia o Flow
                aparecerán aquí.
              </p>
            </div>
          ) : (
            <div
              className={
                styles.recentList
              }
            >
              {recentManualCharges.map(
                (charge) => (
                  <Link
                    className={
                      styles.recentItem
                    }
                    href="/cobros"
                    key={charge.id}
                  >
                    <div>
                      <strong>
                        {charge.sale.client
                          .tradeName ||
                          charge.sale.client
                            .businessName}
                      </strong>

                      <span>
                        Cobro N.º{" "}
                        {charge.number} ·{" "}
                        {charge.concept}
                      </span>

                      <small>
                        {charge.dueDate
                          ? `Fecha límite: ${formatDate(
                              charge.dueDate,
                            )}`
                          : "Sin fecha límite"}{" "}
                        ·{" "}
                        {charge.method ===
                        "FLOW"
                          ? "Flow"
                          : "Transferencia"}
                      </small>
                    </div>

                    <strong
                      className={
                        styles.paymentAmount
                      }
                    >
                      {formatCurrency(
                        charge.amount,
                      )}
                    </strong>
                  </Link>
                ),
              )}
            </div>
          )}
        </article>
      </section>

      <section
        className={styles.lowerGrid}
      >
        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Ingresos
              </span>

              <h2>Pagos recientes</h2>

              <p>
                Últimos pagos reales
                registrados en el portal.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/pagos?filtro=pagados"
            >
              Ver historial
            </Link>
          </div>

          {recentPayments.length === 0 ? (
            <div
              className={
                styles.emptyState
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                $
              </div>

              <h3>
                No existen pagos recientes
              </h3>

              <p>
                Los pagos confirmados
                aparecerán aquí
                automáticamente.
              </p>
            </div>
          ) : (
            <div
              className={
                styles.recentList
              }
            >
              {recentPayments.map(
                (payment) => (
                  <Link
                    className={
                      styles.recentItem
                    }
                    href={`/clientes/${payment.clientId}`}
                    key={payment.id}
                  >
                    <div>
                      <strong>
                        {
                          payment.client
                            .businessName
                        }
                      </strong>

                      <span>
                        {
                          payment.description
                        }
                      </span>

                      <small>
                        Pagado el{" "}
                        {formatDate(
                          payment.paidAt ??
                            payment.updatedAt,
                        )}
                      </small>
                    </div>

                    <strong
                      className={
                        styles.paymentAmount
                      }
                    >
                      {formatCurrency(
                        payment.amount,
                      )}
                    </strong>
                  </Link>
                ),
              )}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <span
                className={
                  styles.panelEyebrow
                }
              >
                Servicios
              </span>

              <h2>
                Planes disponibles
              </h2>

              <p>
                Planes comerciales activos
                en el sistema.
              </p>
            </div>
          </div>

          <div
            className={styles.planList}
          >
            {plans.map((plan) => (
              <div
                className={
                  styles.planItem
                }
                key={plan.id}
              >
                <div>
                  <strong>
                    {plan.name}
                  </strong>

                  <span>
                    {plan.includedRequests ===
                    0
                      ? "Solicitudes cotizadas por separado"
                      : `${plan.includedRequests} solicitudes incluidas`}
                  </span>
                </div>

                <strong
                  className={
                    styles.planPrice
                  }
                >
                  {formatCurrency(
                    plan.monthlyPrice,
                  )}

                  <small>
                    {" "}
                    + IVA
                  </small>
                </strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
