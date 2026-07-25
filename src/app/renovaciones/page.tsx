import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { generatePaymentFromRenewal } from "./actions";
import RenewalEmailComposer from "./RenewalEmailComposer";
import styles from "./renovaciones.module.css";

type RenewalsPageProps = {
  searchParams: Promise<{
    filtro?: string;
    resultado?: string;
  }>;
};

type RenewalFilter =
  | "todas"
  | "sin-aviso"
  | "vencidas"
  | "7"
  | "15"
  | "30"
  | "notificadas"
  | "pagadas"
  | "renovadas";

type ReminderType =
  | "FIRST_NOTICE"
  | "SECOND_NOTICE"
  | "FINAL_NOTICE"
  | "OVERDUE_NOTICE"
  | "MANUAL";

function getStartOfDay() {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date;
}

function getChileDateKey(
  date = new Date(),
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

function addDays(
  date: Date,
  days: number,
) {
  const result =
    new Date(date);

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

function formatDate(date: Date) {
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

function formatDateTime(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function formatCurrency(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Sin monto";
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return "Sin monto";
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

function getRenewalTypeLabel(
  type: string,
) {
  const labels: Record<
    string,
    string
  > = {
    DOMAIN: "Dominio",
    HOSTING: "Hosting",
    EMAIL: "Correo",
    SSL: "Certificado SSL",
    SUBSCRIPTION: "Suscripción",
    ADDITIONAL_SERVICE:
      "Servicio adicional",
  };

  return labels[type] ?? type;
}

function getRenewalStatusLabel(
  status: string,
) {
  const labels: Record<
    string,
    string
  > = {
    UPCOMING: "Próxima",
    NOTIFIED: "Notificada",
    PAID: "Pagada",
    RENEWED: "Renovada",
    EXPIRED: "Vencida",
    CANCELLED: "Cancelada",
  };

  return labels[status] ?? status;
}

function getReminderTypeLabel(
  type: ReminderType,
) {
  const labels: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      "Primer aviso",
    SECOND_NOTICE:
      "Segundo recordatorio",
    FINAL_NOTICE:
      "Recordatorio final",
    OVERDUE_NOTICE:
      "Seguimiento vencido",
    MANUAL:
      "Aviso manual",
  };

  return labels[type];
}

function getDaysDifference(
  dueDate: Date,
  today: Date,
) {
  const difference =
    dueDate.getTime() -
    today.getTime();

  return Math.ceil(
    difference /
      (1000 * 60 * 60 * 24),
  );
}

function getDaysLabel(
  dueDate: Date,
  today: Date,
) {
  const days =
    getDaysDifference(
      dueDate,
      today,
    );

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

function getReminderInfo(
  days: number,
) {
  if (days < 0) {
    return {
      type: "OVERDUE_NOTICE" as const,
      label:
        "Seguimiento inmediato",
      className:
        styles.reminderExpired,
    };
  }

  if (days <= 7) {
    return {
      type: "FINAL_NOTICE" as const,
      label:
        "Recordatorio final",
      className:
        styles.reminderFinal,
    };
  }

  if (days <= 15) {
    return {
      type: "SECOND_NOTICE" as const,
      label:
        "Segundo recordatorio",
      className:
        styles.reminderSecond,
    };
  }

  if (days <= 30) {
    return {
      type: "FIRST_NOTICE" as const,
      label:
        "Primer aviso",
      className:
        styles.reminderFirst,
    };
  }

  return {
    type: "MANUAL" as const,
    label: "Programado",
    className:
      styles.reminderScheduled,
  };
}

function isOpenRenewalStatus(
  status: string,
) {
  return [
    "UPCOMING",
    "NOTIFIED",
    "EXPIRED",
  ].includes(status);
}

function isRenewalVisibleByFilter(
  renewal: {
    dueDate: Date;
    status: string;
    notifications: unknown[];
  },
  filter: RenewalFilter,
  today: Date,
) {
  if (filter === "todas") {
    return true;
  }

  if (
    filter === "sin-aviso"
  ) {
    return (
      isOpenRenewalStatus(
        renewal.status,
      ) &&
      renewal.notifications.length ===
        0
    );
  }

  if (filter === "vencidas") {
    return (
      renewal.dueDate < today &&
      isOpenRenewalStatus(
        renewal.status,
      )
    );
  }

  if (
    filter === "notificadas"
  ) {
    return (
      renewal.status ===
      "NOTIFIED"
    );
  }

  if (filter === "pagadas") {
    return (
      renewal.status === "PAID"
    );
  }

  if (filter === "renovadas") {
    return (
      renewal.status ===
      "RENEWED"
    );
  }

  const days = Number(filter);

  if (
    [7, 15, 30].includes(days)
  ) {
    const limit = addDays(
      today,
      days,
    );

    return (
      renewal.dueDate >= today &&
      renewal.dueDate <= limit &&
      isOpenRenewalStatus(
        renewal.status,
      )
    );
  }

  return true;
}

export default async function RenewalsPage({
  searchParams,
}: RenewalsPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const allowedFilters: RenewalFilter[] =
    [
      "todas",
      "sin-aviso",
      "vencidas",
      "7",
      "15",
      "30",
      "notificadas",
      "pagadas",
      "renovadas",
    ];

  const requestedFilter =
    resolvedSearchParams.filtro ??
    "todas";

  const activeFilter =
    allowedFilters.includes(
      requestedFilter as RenewalFilter,
    )
      ? (requestedFilter as RenewalFilter)
      : "todas";

  const today = getStartOfDay();
  const todayChileKey =
    getChileDateKey();

  const sevenDays = addDays(
    today,
    7,
  );

  const fifteenDays = addDays(
    today,
    15,
  );

  const thirtyDays = addDays(
    today,
    30,
  );

  const [
    renewals,
    generatedPayments,
  ] = await Promise.all([
    prisma.renewal.findMany({
      orderBy: {
        dueDate: "asc",
      },
      include: {
        client: true,
        project: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        notifications: {
          orderBy: {
            sentAt: "desc",
          },
        },
      },
    }),

    prisma.payment.findMany({
      where: {
        reference: {
          startsWith:
            "renewal:",
        },
      },
      select: {
        reference: true,
        status: true,
      },
    }),
  ]);

  const paymentsByReference =
    new Map(
      generatedPayments.map(
        (payment) => [
          payment.reference,
          payment.status,
        ],
      ),
    );

  const filteredRenewals =
    renewals.filter((renewal) =>
      isRenewalVisibleByFilter(
        renewal,
        activeFilter,
        today,
      ),
    );

  const expiredCount =
    renewals.filter(
      (renewal) =>
        renewal.dueDate < today &&
        isOpenRenewalStatus(
          renewal.status,
        ),
    ).length;

  const withoutNoticeCount =
    renewals.filter(
      (renewal) =>
        isOpenRenewalStatus(
          renewal.status,
        ) &&
        renewal.notifications
          .length === 0,
    ).length;

  const nextSevenDaysCount =
    renewals.filter(
      (renewal) =>
        renewal.dueDate >= today &&
        renewal.dueDate <=
          sevenDays &&
        isOpenRenewalStatus(
          renewal.status,
        ),
    ).length;

  const nextFifteenDaysCount =
    renewals.filter(
      (renewal) =>
        renewal.dueDate >= today &&
        renewal.dueDate <=
          fifteenDays &&
        isOpenRenewalStatus(
          renewal.status,
        ),
    ).length;

  const nextThirtyDaysCount =
    renewals.filter(
      (renewal) =>
        renewal.dueDate >= today &&
        renewal.dueDate <=
          thirtyDays &&
        isOpenRenewalStatus(
          renewal.status,
        ),
    ).length;

  const notifiedCount =
    renewals.filter(
      (renewal) =>
        renewal.status ===
        "NOTIFIED",
    ).length;

  const paidCount =
    renewals.filter(
      (renewal) =>
        renewal.status === "PAID",
    ).length;

  const renewedCount =
    renewals.filter(
      (renewal) =>
        renewal.status ===
        "RENEWED",
    ).length;

  const pendingAmount =
    renewals
      .filter((renewal) =>
        isOpenRenewalStatus(
          renewal.status,
        ),
      )
      .reduce(
        (
          total,
          renewal,
        ) =>
          total +
          Number(
            renewal.amount ?? 0,
          ),
        0,
      );

  const filters: Array<{
    label: string;
    value: RenewalFilter;
    count: number;
  }> = [
    {
      label: "Todas",
      value: "todas",
      count: renewals.length,
    },
    {
      label: "Sin aviso",
      value: "sin-aviso",
      count:
        withoutNoticeCount,
    },
    {
      label: "Vencidas",
      value: "vencidas",
      count: expiredCount,
    },
    {
      label:
        "Próximos 7 días",
      value: "7",
      count:
        nextSevenDaysCount,
    },
    {
      label:
        "Próximos 15 días",
      value: "15",
      count:
        nextFifteenDaysCount,
    },
    {
      label:
        "Próximos 30 días",
      value: "30",
      count:
        nextThirtyDaysCount,
    },
    {
      label: "Notificadas",
      value: "notificadas",
      count: notifiedCount,
    },
    {
      label: "Pagadas",
      value: "pagadas",
      count: paidCount,
    },
    {
      label: "Renovadas",
      value: "renovadas",
      count: renewedCount,
    },
  ];

  return (
    <main
      className={styles.page}
    >
      <header
        className={styles.header}
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            Administración de servicios
          </span>

          <h1>Renovaciones</h1>

          <p>
            Controla vencimientos,
            prepara recordatorios,
            conserva el historial y
            genera los cobros de los
            servicios administrados
            por Vialoop.
          </p>
        </div>

        <div
          className={
            styles.headerActions
          }
        >
          <Link
            className={
              styles.secondaryButton
            }
            href="/pagos"
          >
            Ver pagos
          </Link>

          <Link
            className={
              styles.secondaryButton
            }
            href="/"
          >
            Volver al dashboard
          </Link>
        </div>
      </header>

      {resolvedSearchParams.resultado ===
        "notificada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La notificación fue
          registrada y agregada al
          historial de la renovación.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "duplicada" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          Este tipo de recordatorio ya
          fue registrado hoy. No se
          creó un aviso duplicado.
        </div>
      )}

      <section
        className={styles.summary}
      >
        <article>
          <span>
            Renovaciones registradas
          </span>

          <strong>
            {renewals.length}
          </strong>

          <p>
            Total almacenado en el
            sistema
          </p>
        </article>

        <article
          className={
            expiredCount > 0
              ? styles.alertCard
              : ""
          }
        >
          <span>
            Renovaciones vencidas
          </span>

          <strong>
            {expiredCount}
          </strong>

          <p>
            Requieren revisión o
            regularización
          </p>
        </article>

        <article>
          <span>
            Próximos 30 días
          </span>

          <strong>
            {nextThirtyDaysCount}
          </strong>

          <p>
            Servicios próximos a
            vencer
          </p>
        </article>

        <article>
          <span>
            Monto pendiente registrado
          </span>

          <strong
            className={
              styles.amount
            }
          >
            {formatCurrency(
              pendingAmount,
            )}
          </strong>

          <p>
            Suma de renovaciones
            abiertas
          </p>
        </article>
      </section>

      <nav
        aria-label="Filtros de renovaciones"
        className={styles.filters}
      >
        {filters.map((filter) => (
          <Link
            className={`${
              styles.filterButton
            } ${
              activeFilter ===
              filter.value
                ? styles.activeFilter
                : ""
            }`}
            href={
              filter.value ===
              "todas"
                ? "/renovaciones"
                : `/renovaciones?filtro=${filter.value}`
            }
            key={filter.value}
          >
            {filter.label}

            <span>
              {filter.count}
            </span>
          </Link>
        ))}
      </nav>

      <section
        className={styles.panel}
      >
        <div
          className={
            styles.panelHeader
          }
        >
          <div>
            <h2>
              Calendario de vencimientos
            </h2>

            <p>
              Se muestran{" "}
              {
                filteredRenewals.length
              }{" "}
              registros según el filtro
              seleccionado.
            </p>
          </div>
        </div>

        {filteredRenewals.length ===
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
              para este filtro
            </h3>

            <p>
              Selecciona otro periodo
              o estado para revisar
              los demás registros.
            </p>
          </div>
        ) : (
          <div
            className={
              styles.tableWrapper
            }
          >
            <table
              className={styles.table}
            >
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>
                    Dominio / proyecto
                  </th>
                  <th>Vencimiento</th>
                  <th>Plazo</th>
                  <th>
                    Seguimiento
                  </th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {filteredRenewals.map(
                  (renewal) => {
                    const daysDifference =
                      getDaysDifference(
                        renewal.dueDate,
                        today,
                      );

                    const reminderInfo =
                      getReminderInfo(
                        daysDifference,
                      );

                    const isOverdue =
                      daysDifference < 0 &&
                      isOpenRenewalStatus(
                        renewal.status,
                      );

                    const isUpcoming =
                      daysDifference >=
                        0 &&
                      daysDifference <=
                        30 &&
                      isOpenRenewalStatus(
                        renewal.status,
                      );

                    const paymentReference =
                      `renewal:${renewal.id}`;

                    const paymentStatus =
                      paymentsByReference.get(
                        paymentReference,
                      );

                    const canGeneratePayment =
                      renewal.amount !==
                        null &&
                      isOpenRenewalStatus(
                        renewal.status,
                      ) &&
                      !paymentStatus;

                    const canNotify =
                      isOpenRenewalStatus(
                        renewal.status,
                      );

                    const generatePaymentWithId =
                      generatePaymentFromRenewal.bind(
                        null,
                        renewal.id,
                      );

                    const serviceName =
                      getRenewalTypeLabel(
                        renewal.type,
                      );

                    const domain =
                      renewal.project
                        ?.domain ??
                      renewal.project
                        ?.name ??
                      "Servicio Vialoop";

                    const sentToday =
                      renewal.notifications.some(
                        (
                          notification,
                        ) =>
                          notification.type ===
                            reminderInfo.type &&
                          notification.sentOn
                            .toISOString()
                            .slice(
                              0,
                              10,
                            ) ===
                            todayChileKey,
                      );

                    const latestNotification =
                      renewal.notifications[0] ??
                      null;

                    const notificationHistory =
                      renewal.notifications.map(
                        (
                          notification,
                        ) => ({
                          id:
                            notification.id,
                          type:
                            notification.type,
                          label:
                            getReminderTypeLabel(
                              notification.type,
                            ),
                          recipient:
                            notification.recipient,
                          subject:
                            notification.subject,
                          sentAt:
                            formatDateTime(
                              notification.sentAt,
                            ),
                        }),
                      );

                    return (
                      <tr
                        className={
                          isOverdue
                            ? styles.overdueRow
                            : isUpcoming
                              ? styles.upcomingRow
                              : undefined
                        }
                        key={
                          renewal.id
                        }
                      >
                        <td>
                          <Link
                            className={
                              styles.clientLink
                            }
                            href={`/clientes/${renewal.client.id}`}
                          >
                            <strong>
                              {
                                renewal.client
                                  .businessName
                              }
                            </strong>

                            <span>
                              {renewal.client
                                .email ??
                                "Sin correo registrado"}
                            </span>
                          </Link>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.serviceName
                            }
                          >
                            {
                              serviceName
                            }
                          </strong>

                          <span
                            className={
                              styles.secondaryText
                            }
                          >
                            {
                              renewal.description
                            }
                          </span>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.domain
                            }
                          >
                            {domain}
                          </strong>

                          <span
                            className={
                              styles.secondaryText
                            }
                          >
                            {renewal.project
                              ?.hostingCapacity ??
                              renewal.subscription
                                ?.plan
                                .name ??
                              "Sin capacidad o plan"}
                          </span>
                        </td>

                        <td>
                          {formatDate(
                            renewal.dueDate,
                          )}
                        </td>

                        <td>
                          <span
                            className={`${
                              styles.deadline
                            } ${
                              isOverdue
                                ? styles.deadlineExpired
                                : isUpcoming
                                  ? styles.deadlineUpcoming
                                  : styles.deadlineNormal
                            }`}
                          >
                            {getDaysLabel(
                              renewal.dueDate,
                              today,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`${
                              styles.reminder
                            } ${
                              reminderInfo.className
                            }`}
                          >
                            {
                              reminderInfo.label
                            }
                          </span>

                          <div
                            className={
                              styles.notificationMeta
                            }
                          >
                            <span>
                              {
                                renewal
                                  .notifications
                                  .length
                              }{" "}
                              {renewal
                                .notifications
                                .length ===
                              1
                                ? "aviso"
                                : "avisos"}
                            </span>

                            {latestNotification && (
                              <small>
                                Último:{" "}
                                {formatDate(
                                  latestNotification.sentAt,
                                )}
                              </small>
                            )}
                          </div>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.price
                            }
                          >
                            {formatCurrency(
                              renewal.amount,
                            )}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`${
                              styles.status
                            } ${
                              styles[
                                `status${renewal.status
                                  .charAt(
                                    0,
                                  )
                                  .toUpperCase()}${renewal.status
                                  .slice(
                                    1,
                                  )
                                  .toLowerCase()}`
                              ] ?? ""
                            }`}
                          >
                            {getRenewalStatusLabel(
                              renewal.status,
                            )}
                          </span>
                        </td>

                        <td>
                          <div
                            className={
                              styles.actions
                            }
                          >
                            {canNotify && (
                              <RenewalEmailComposer
                                alreadyNotified={
                                  renewal
                                    .notifications
                                    .length >
                                  0
                                }
                                amount={formatCurrency(
                                  renewal.amount,
                                )}
                                clientName={
                                  renewal
                                    .client
                                    .businessName
                                }
                                description={
                                  renewal.description
                                }
                                domain={
                                  domain
                                }
                                dueDate={formatDate(
                                  renewal.dueDate,
                                )}
                                mainContactName={
                                  renewal
                                    .client
                                    .mainContactName ??
                                  ""
                                }
                                notificationHistory={
                                  notificationHistory
                                }
                                recipient={
                                  renewal
                                    .client
                                    .email ??
                                  ""
                                }
                                reminderLabel={
                                  reminderInfo.label
                                }
                                reminderType={
                                  reminderInfo.type
                                }
                                renewalId={
                                  renewal.id
                                }
                                sentToday={
                                  sentToday
                                }
                                serviceName={
                                  serviceName
                                }
                              />
                            )}

                            {canGeneratePayment ? (
                              <form
                                action={
                                  generatePaymentWithId
                                }
                              >
                                <button
                                  className={
                                    styles.viewButton
                                  }
                                  type="submit"
                                >
                                  Generar cobro
                                </button>
                              </form>
                            ) : paymentStatus ? (
                              <Link
                                className={
                                  styles.viewButton
                                }
                                href="/pagos"
                              >
                                Ver cobro
                              </Link>
                            ) : (
                              <Link
                                className={
                                  styles.viewButton
                                }
                                href={`/clientes/${renewal.client.id}/editar`}
                              >
                                Completar monto
                              </Link>
                            )}

                            <Link
                              className={
                                styles.viewButton
                              }
                              href={`/clientes/${renewal.client.id}`}
                            >
                              Ver ficha
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}