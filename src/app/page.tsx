import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHILE_TIME_ZONE = "America/Santiago";
const MONTHLY_SALES_TARGET = 3_500_000;

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

function formatDate(
  date: Date | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: CHILE_TIME_ZONE,
  }).format(date);
}

function formatLongDate(date: Date) {
  const formattedDate =
    new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: CHILE_TIME_ZONE,
    }).format(date);

  return (
    formattedDate.charAt(0).toUpperCase() +
    formattedDate.slice(1)
  );
}

function formatMonth(date: Date) {
  const formattedMonth =
    new Intl.DateTimeFormat("es-CL", {
      month: "long",
      year: "numeric",
      timeZone: CHILE_TIME_ZONE,
    }).format(date);

  return (
    formattedMonth.charAt(0).toUpperCase() +
    formattedMonth.slice(1)
  );
}

function formatPercentage(value: number) {
  return value
    .toFixed(1)
    .replace(".", ",");
}

function getChileDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: CHILE_TIME_ZONE,
  }).format(date);
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
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: CHILE_TIME_ZONE,
    }).formatToParts(date);

  const year = Number(
    dateParts.find(
      (part) => part.type === "year",
    )?.value,
  );

  const month = Number(
    dateParts.find(
      (part) => part.type === "month",
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

  result.setUTCDate(
    result.getUTCDate() + days,
  );

  result.setUTCHours(
    23,
    59,
    59,
    999,
  );

  return result;
}

function getDaysDifference(
  dueDate: Date,
  currentDate: Date,
) {
  const dueDateValue = new Date(
    `${getChileDateKey(
      dueDate,
    )}T00:00:00.000Z`,
  ).getTime();

  const currentDateValue = new Date(
    `${getChileDateKey(
      currentDate,
    )}T00:00:00.000Z`,
  ).getTime();

  return Math.round(
    (dueDateValue -
      currentDateValue) /
      (1000 * 60 * 60 * 24),
  );
}

function getDeadlineLabel(
  days: number,
) {
  if (days === 0) {
    return "Vence hoy";
  }

  if (days === 1) {
    return "Vence mañana";
  }

  return `En ${days} días`;
}

function getUrgencyClass(
  days: number,
) {
  if (days <= 3) {
    return styles.dueUrgent;
  }

  if (days <= 10) {
    return styles.dueSoon;
  }

  return styles.dueUpcoming;
}

export default async function Home() {
  const currentDate = new Date();
  const today =
    getStartOfDay(currentDate);
  const nextThirtyDays =
    addDays(today, 30);
  const currentMonth =
    getChileMonthRange(currentDate);

  const [
    monthlySalesAmountResult,
    monthlySalesCount,
    upcomingRenewals,
    recentSales,
    plans,
  ] = await Promise.all([
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

    prisma.renewal.findMany({
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
      orderBy: {
        dueDate: "asc",
      },
      take: 5,
      include: {
        client: true,
        project: true,
      },
    }),

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
  ]);

  const monthlySalesAmount =
    Number(
      monthlySalesAmountResult
        ._sum.netAmount ?? 0,
    );

  const monthlySalesProgress =
    MONTHLY_SALES_TARGET > 0
      ? (monthlySalesAmount /
          MONTHLY_SALES_TARGET) *
        100
      : 0;

  const progressBarWidth =
    Math.min(
      monthlySalesProgress,
      100,
    );

  const monthlySalesRemaining =
    Math.max(
      MONTHLY_SALES_TARGET -
        monthlySalesAmount,
      0,
    );

  const monthlySalesExceeded =
    Math.max(
      monthlySalesAmount -
        MONTHLY_SALES_TARGET,
      0,
    );

  return (
    <main className={styles.content}>
      <header className={styles.header}>
        <div>
          <span
            className={styles.eyebrow}
          >
            Resumen comercial
          </span>

          <h1>Dashboard</h1>

          <p>
            Una vista simple de la meta
            mensual, las últimas ventas
            y los próximos cobros de
            Vialoop.
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

        <Link
          className={
            styles.primaryButton
          }
          href="/ventas"
        >
          Registrar venta
        </Link>
      </header>

      <section
        className={styles.metrics}
      >
        <Link
          className={
            styles.metricCard
          }
          href="/ventas"
        >
          <span>
            Vendido en{" "}
            {formatMonth(currentDate)}
          </span>

          <strong>
            {formatCurrency(
              monthlySalesAmount,
            )}
          </strong>

          <p>
            {monthlySalesCount}{" "}
            {monthlySalesCount === 1
              ? "venta activa"
              : "ventas activas"}
          </p>
        </Link>

        <article
          className={
            styles.metricCard
          }
        >
          <span>Meta mensual</span>

          <strong>
            {formatCurrency(
              MONTHLY_SALES_TARGET,
            )}
          </strong>

          <p>Monto neto, sin IVA</p>
        </article>

        <article
          className={
            styles.metricCard
          }
        >
          <span>
            Avance alcanzado
          </span>

          <strong>
            {formatPercentage(
              monthlySalesProgress,
            )}
            %
          </strong>

          <p>
            Progreso de la meta comercial
          </p>
        </article>

        <article
          className={`${
            styles.metricCard
          } ${
            monthlySalesRemaining === 0
              ? styles.metricCardSuccess
              : ""
          }`}
        >
          <span>
            {monthlySalesRemaining > 0
              ? "Falta para la meta"
              : "Meta cumplida"}
          </span>

          <strong>
            {monthlySalesRemaining > 0
              ? formatCurrency(
                  monthlySalesRemaining,
                )
              : formatCurrency(
                  monthlySalesExceeded,
                )}
          </strong>

          <p>
            {monthlySalesRemaining > 0
              ? "Monto pendiente por vender"
              : "Monto vendido sobre la meta"}
          </p>
        </article>
      </section>

      <section
        className={styles.goalPanel}
      >
        <div
          className={styles.goalHeader}
        >
          <div>
            <span
              className={
                styles.panelEyebrow
              }
            >
              Meta del mes
            </span>

            <h2>Avance comercial</h2>
          </div>

          <div
            className={
              styles.goalSummary
            }
          >
            <strong>
              {formatPercentage(
                monthlySalesProgress,
              )}
              %
            </strong>

            <span>
              {monthlySalesRemaining > 0
                ? `${formatCurrency(
                    monthlySalesRemaining,
                  )} por vender`
                : "Meta mensual alcanzada"}
            </span>
          </div>
        </div>

        <div
          aria-label="Avance de la meta mensual"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.min(
            Math.round(
              monthlySalesProgress,
            ),
            100,
          )}
          className={
            styles.progressTrack
          }
          role="progressbar"
        >
          <span
            className={
              styles.progressValue
            }
            style={{
              width: `${progressBarWidth}%`,
            }}
          />
        </div>

        <div
          className={
            styles.progressLabels
          }
        >
          <span>
            {formatCurrency(
              monthlySalesAmount,
            )}{" "}
            vendido
          </span>

          <span>
            {formatCurrency(
              MONTHLY_SALES_TARGET,
            )}{" "}
            meta
          </span>
        </div>
      </section>

      <section
        className={styles.mainGrid}
      >
        <article
          className={styles.panel}
        >
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
                Próximos 30 días
              </span>

              <h2>Próximos cobros</h2>

              <p>
                Los cinco vencimientos
                más cercanos que deben
                gestionarse.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/renovaciones"
            >
              Ver todos
            </Link>
          </div>

          {upcomingRenewals.length ===
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
                No hay cobros próximos
              </h3>

              <p>
                No existen renovaciones
                con vencimiento durante
                los siguientes 30 días.
              </p>
            </div>
          ) : (
            <div
              className={styles.list}
            >
              {upcomingRenewals.map(
                (renewal) => {
                  const days =
                    getDaysDifference(
                      renewal.dueDate,
                      currentDate,
                    );

                  const service =
                    renewal.project
                      ?.domain ??
                    renewal.project
                      ?.name ??
                    renewal.description;

                  return (
                    <Link
                      className={
                        styles.chargeItem
                      }
                      href="/renovaciones"
                      key={renewal.id}
                    >
                      <div
                        className={
                          styles.itemMain
                        }
                      >
                        <div
                          className={
                            styles.itemTopline
                          }
                        >
                          <strong>
                            {
                              renewal
                                .client
                                .businessName
                            }
                          </strong>

                          <span
                            className={`${
                              styles.dueBadge
                            } ${getUrgencyClass(
                              days,
                            )}`}
                          >
                            {getDeadlineLabel(
                              days,
                            )}
                          </span>
                        </div>

                        <span
                          className={
                            styles.itemDescription
                          }
                        >
                          {service}
                        </span>

                        <small>
                          Fecha de cobro:{" "}
                          {formatDate(
                            renewal.dueDate,
                          )}
                        </small>
                      </div>

                      <strong
                        className={
                          styles.itemAmount
                        }
                      >
                        {formatCurrency(
                          renewal.amount,
                        )}
                      </strong>
                    </Link>
                  );
                },
              )}
            </div>
          )}
        </article>

        <article
          className={styles.panel}
        >
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
                Registro comercial
              </span>

              <h2>Ventas recientes</h2>

              <p>
                Solo las ventas activas
                registradas en el módulo
                de Ventas.
              </p>
            </div>

            <Link
              className={
                styles.secondaryButton
              }
              href="/ventas"
            >
              Ver ventas
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
                Aún no hay ventas
                registradas
              </h3>

              <p>
                Las ventas activas
                aparecerán aquí con su
                fecha, servicio y monto.
              </p>
            </div>
          ) : (
            <div
              className={styles.list}
            >
              {recentSales.map(
                (sale) => (
                  <Link
                    className={
                      styles.saleItem
                    }
                    href={`/clientes/${sale.clientId}`}
                    key={sale.id}
                  >
                    <div
                      className={
                        styles.itemMain
                      }
                    >
                      <div
                        className={
                          styles.saleHeading
                        }
                      >
                        <strong>
                          {sale.client
                            .tradeName ||
                            sale.client
                              .businessName}
                        </strong>

                        <span>
                          Venta N.º{" "}
                          {sale.number}
                        </span>
                      </div>

                      <span
                        className={
                          styles.itemDescription
                        }
                      >
                        {sale.service}
                      </span>

                      <small>
                        Registrada el{" "}
                        {formatDate(
                          sale.saleDate,
                        )}
                      </small>
                    </div>

                    <strong
                      className={
                        styles.saleAmount
                      }
                    >
                      {formatCurrency(
                        sale.netAmount,
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
        className={styles.plansPanel}
      >
        <div
          className={styles.plansHeader}
        >
          <div>
            <span
              className={
                styles.panelEyebrow
              }
            >
              Referencia comercial
            </span>

            <h2>Planes disponibles</h2>
          </div>

          <p>
            Valores mensuales vigentes,
            sin IVA.
          </p>
        </div>

        {plans.length === 0 ? (
          <div
            className={
              styles.plansEmpty
            }
          >
            No hay planes activos.
          </div>
        ) : (
          <div
            className={styles.planGrid}
          >
            {plans.map((plan) => (
              <article
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
                      : `${
                          plan.includedRequests
                        } ${
                          plan.includedRequests ===
                          1
                            ? "solicitud incluida"
                            : "solicitudes incluidas"
                        }`}
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
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}