import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  cancelPayment,
} from "./actions";
import FlowPaymentButton from "./FlowPaymentButton";
import PaymentEmailManager from "./PaymentEmailManager";
import PaymentForm from "./PaymentForm";
import styles from "./pagos.module.css";

type PaymentsPageProps = {
  searchParams: Promise<{
    filtro?: string;
    resultado?: string;
    cobro?: string;
    comprobante?: string;
  }>;
};

type PaymentFilter =
  | "todos"
  | "pendientes"
  | "vencidos"
  | "pagados"
  | "cancelados"
  | "pruebas";

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

function formatCurrency(
  value: unknown,
) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount)
  ) {
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

function getPaymentStatusLabel(
  status: string,
) {
  const labels: Record<
    string,
    string
  > = {
    PENDING:
      "Pendiente",

    PAID:
      "Pagado",

    OVERDUE:
      "Vencido",

    CANCELLED:
      "Cancelado",

    REFUNDED:
      "Reembolsado",
  };

  return labels[status] ??
    status;
}

function getPaymentMethodLabel(
  method:
    | string
    | null
    | undefined,
) {
  const labels: Record<
    string,
    string
  > = {
    BANK_TRANSFER:
      "Transferencia",

    FLOW:
      "Flow",

    CREDIT_CARD:
      "Crédito",

    DEBIT_CARD:
      "Débito",

    CASH:
      "Efectivo",

    OTHER:
      "Otro",
  };

  if (!method) {
    return "Sin registrar";
  }

  return labels[method] ??
    method;
}

function formatDateInput(
  date: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone:
          "America/Santiago",
      },
    ).formatToParts(date);

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value ?? "";

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value ?? "";

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value ?? "";

  return `${year}-${month}-${day}`;
}

function getFlowStatusLabel(
  status:
    | string
    | null
    | undefined,
) {
  const labels: Record<
    string,
    string
  > = {
    PENDING:
      "Pendiente",

    PAID:
      "Pagada",

    REJECTED:
      "Rechazada",

    CANCELLED:
      "Cancelada",

    ERROR:
      "Error",
  };

  if (!status) {
    return "Sin orden";
  }

  return labels[status] ??
    status;
}

function isTestPayment(
  notes: string | null,
) {
  return Boolean(
    notes?.includes(
      "[PRUEBA]",
    ),
  );
}

function isVisibleByFilter(
  payment: {
    status: string;
    notes: string | null;
  },
  filter: PaymentFilter,
) {
  const isTest =
    isTestPayment(
      payment.notes,
    );

  if (
    filter === "pruebas"
  ) {
    return isTest;
  }

  if (isTest) {
    return false;
  }

  if (
    filter === "todos"
  ) {
    return true;
  }

  if (
    filter === "pendientes"
  ) {
    return (
      payment.status ===
      "PENDING"
    );
  }

  if (
    filter === "vencidos"
  ) {
    return (
      payment.status ===
      "OVERDUE"
    );
  }

  if (
    filter === "pagados"
  ) {
    return (
      payment.status ===
      "PAID"
    );
  }

  if (
    filter === "cancelados"
  ) {
    return (
      payment.status ===
      "CANCELLED"
    );
  }

  return true;
}

export default async function PaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const validFilters: PaymentFilter[] = [
    "todos",
    "pendientes",
    "vencidos",
    "pagados",
    "cancelados",
    "pruebas",
  ];

  const requestedFilter =
    resolvedSearchParams.filtro ??
    "todos";

  const activeFilter =
    validFilters.includes(
      requestedFilter as PaymentFilter,
    )
      ? (
          requestedFilter as PaymentFilter
        )
      : "todos";

  const payments =
    await prisma.payment.findMany({
      orderBy: [
        {
          dueDate:
            "asc",
        },
        {
          createdAt:
            "desc",
        },
      ],

      include: {
        client:
          true,

        subscription: {
          include: {
            plan:
              true,
          },
        },

        flowOrders: {
          orderBy: {
            createdAt:
              "desc",
          },

          take:
            1,
        },

        receipt:
          true,

        invoice:
          true,
      },
    });

  const realPayments =
    payments.filter(
      (payment) =>
        !isTestPayment(
          payment.notes,
        ),
    );

  const testPayments =
    payments.filter(
      (payment) =>
        isTestPayment(
          payment.notes,
        ),
    );

  const filteredPayments =
    payments.filter(
      (payment) =>
        isVisibleByFilter(
          payment,
          activeFilter,
        ),
    );

  const pendingCount =
    realPayments.filter(
      (payment) =>
        payment.status ===
        "PENDING",
    ).length;

  const overdueCount =
    realPayments.filter(
      (payment) =>
        payment.status ===
        "OVERDUE",
    ).length;

  const paidCount =
    realPayments.filter(
      (payment) =>
        payment.status ===
        "PAID",
    ).length;

  const cancelledCount =
    realPayments.filter(
      (payment) =>
        payment.status ===
        "CANCELLED",
    ).length;

  const pendingAmount =
    realPayments
      .filter(
        (payment) =>
          payment.status ===
            "PENDING" ||
          payment.status ===
            "OVERDUE",
      )
      .reduce(
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

  const paidAmount =
    realPayments
      .filter(
        (payment) =>
          payment.status ===
          "PAID",
      )
      .reduce(
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

  const filters: Array<{
    label: string;
    value: PaymentFilter;
    count: number;
  }> = [
    {
      label:
        "Todos",

      value:
        "todos",

      count:
        realPayments.length,
    },

    {
      label:
        "Pendientes",

      value:
        "pendientes",

      count:
        pendingCount,
    },

    {
      label:
        "Vencidos",

      value:
        "vencidos",

      count:
        overdueCount,
    },

    {
      label:
        "Pagados",

      value:
        "pagados",

      count:
        paidCount,
    },

    {
      label:
        "Cancelados",

      value:
        "cancelados",

      count:
        cancelledCount,
    },

    {
      label:
        "Pruebas",

      value:
        "pruebas",

      count:
        testPayments.length,
    },
  ];

  return (
    <main
      className={
        styles.page
      }
    >
      <header
        className={
          styles.header
        }
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            Administración financiera
          </span>

          <h1>
            Pagos y cobros
          </h1>

          <p>
            Registra pagos, genera
            enlaces Flow, controla
            vencimientos y conserva el
            historial financiero de los
            clientes de Vialoop.
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
            href="/renovaciones"
          >
            Ver renovaciones
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
        "creado" && (
        <div
          className={
            styles.successMessage
          }
        >
          El cobro fue generado
          correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "existente" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          Esta renovación ya tenía un
          cobro generado.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "flow-creado" && (
        <div
          className={
            styles.successMessage
          }
        >
          La orden Flow fue creada
          correctamente. El botón
          “Abrir Flow” ya está
          disponible en el cobro.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "flow-existente" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          Este cobro ya tiene una orden
          Flow pendiente. Utiliza el
          botón “Abrir Flow”.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "flow-sin-correo" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          No fue posible crear la orden
          Flow porque el cliente no
          tiene un correo electrónico
          válido.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "flow-sin-monto" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          No fue posible crear la orden
          Flow porque el cobro no tiene
          un monto válido.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "flow-error" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          Flow rechazó la solicitud o
          no fue posible conectarse.
          Revisa las credenciales y la
          terminal del proyecto.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "pagado" && (
        <div
          className={
            styles.successMessage
          }
        >
          El pago fue registrado
          correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "pagado-renovacion-creada" && (
        <div
          className={
            styles.successMessage
          }
        >
          El pago fue registrado, la
          renovación anterior quedó
          cerrada y se creó el próximo
          vencimiento.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "pagado-renovacion-existente" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          El pago fue registrado. La
          próxima renovación ya existía
          y no fue duplicada.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "pagado-sin-renovar" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          El pago fue registrado, pero
          no se creó una nueva
          renovación.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "pagado-prueba" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          El registro de prueba fue
          guardado. No se modificó la
          renovación ni la fecha del
          cliente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "cancelado" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          El cobro fue cancelado
          correctamente.
        </div>
      )}

      {resolvedSearchParams.comprobante ===
        "enviado" && (
        <div
          className={
            styles.successMessage
          }
        >
          El comprobante de pago fue
          enviado automáticamente al
          cliente.
        </div>
      )}

      {resolvedSearchParams.comprobante ===
        "fallido" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          El pago quedó registrado,
          pero el correo del comprobante
          no pudo enviarse. El documento
          conserva su mismo número y
          puede reenviarse desde este
          registro.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "comprobante-enviado" && (
        <div
          className={
            styles.successMessage
          }
        >
          El comprobante fue emitido y
          enviado correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "comprobante-reenviado" && (
        <div
          className={
            styles.successMessage
          }
        >
          El comprobante fue reenviado
          correctamente sin cambiar su
          número.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "comprobante-error" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          No fue posible enviar el
          comprobante. Revisa el correo
          del cliente y la configuración
          SMTP.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "factura-enviada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La factura fue guardada y
          enviada correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "factura-reenviada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La factura fue reenviada
          correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "factura-guardada-envio-fallido" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          La factura quedó guardada,
          pero el correo no pudo
          enviarse. Puedes reenviarla
          desde el mismo pago sin volver
          a cargar el PDF.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "factura-error" && (
        <div
          className={
            styles.noticeMessage
          }
        >
          No fue posible guardar o
          enviar la factura. Revisa el
          número, la fecha y que el PDF
          no supere los 5 MB.
        </div>
      )}

      <section
        className={
          styles.summary
        }
      >
        <article>
          <span>
            Cobros pendientes
          </span>

          <strong>
            {pendingCount}
          </strong>

          <p>
            Pagos dentro de su plazo
          </p>
        </article>

        <article
          className={
            overdueCount > 0
              ? styles.alertCard
              : ""
          }
        >
          <span>
            Cobros vencidos
          </span>

          <strong>
            {overdueCount}
          </strong>

          <p>
            Requieren seguimiento
          </p>
        </article>

        <article>
          <span>
            Monto por cobrar
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
            Pendiente y vencido
          </p>
        </article>

        <article>
          <span>
            Ingresos reales
          </span>

          <strong
            className={
              styles.paidAmount
            }
          >
            {formatCurrency(
              paidAmount,
            )}
          </strong>

          <p>
            Excluye registros de prueba
          </p>
        </article>
      </section>

      <nav
        aria-label="Filtros de pagos"
        className={
          styles.filters
        }
      >
        {filters.map(
          (filter) => (
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
                "todos"
                  ? "/pagos"
                  : `/pagos?filtro=${filter.value}`
              }
              key={
                filter.value
              }
            >
              {filter.label}

              <span>
                {filter.count}
              </span>
            </Link>
          ),
        )}
      </nav>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeader
          }
        >
          <div>
            <h2>
              Registro financiero
            </h2>

            <p>
              Se muestran{" "}
              {
                filteredPayments.length
              }{" "}
              registros según el filtro
              seleccionado.
            </p>
          </div>
        </div>

        {filteredPayments.length ===
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
              $
            </div>

            <h3>
              No existen pagos para
              este filtro
            </h3>

            <p>
              Los cobros generados
              desde renovaciones
              aparecerán en esta
              sección.
            </p>
          </div>
        ) : (
          <div
            className={
              styles.tableWrapper
            }
          >
            <table
              className={
                styles.table
              }
            >
              <thead>
                <tr>
                  <th>
                    Cliente
                  </th>

                  <th>
                    Descripción
                  </th>

                  <th>
                    Registro
                  </th>

                  <th>
                    Vencimiento
                  </th>

                  <th>
                    Monto
                  </th>

                  <th>
                    Estado
                  </th>

                  <th>
                    Medio
                  </th>

                  <th>
                    Fecha de pago
                  </th>

                  <th
                    aria-label="Acciones"
                  />
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map(
                  (payment) => {
                    const isTest =
                      isTestPayment(
                        payment.notes,
                      );

                    const latestFlowOrder =
                      payment
                        .flowOrders[0] ??
                      null;

                    const hasPendingFlowLink =
                      latestFlowOrder
                        ?.status ===
                        "PENDING" &&
                      Boolean(
                        latestFlowOrder
                          .paymentUrl,
                      );

                    const cancelPaymentWithId =
                      cancelPayment.bind(
                        null,
                        payment.id,
                      );

                    const canManage =
                      payment.status ===
                        "PENDING" ||
                      payment.status ===
                        "OVERDUE";

                    return (
                      <tr
                        key={
                          payment.id
                        }
                      >
                        <td>
                          <Link
                            className={
                              styles.clientLink
                            }
                            href={`/clientes/${payment.clientId}`}
                          >
                            <strong>
                              {
                                payment.client
                                  .businessName
                              }
                            </strong>

                            <span>
                              {payment.client
                                .email ??
                                "Sin correo registrado"}
                            </span>
                          </Link>
                        </td>

                        <td>
                          <strong
                            className={
                              styles.description
                            }
                          >
                            {
                              payment.description
                            }
                          </strong>

                          <span
                            className={
                              styles.secondaryText
                            }
                          >
                            {payment.subscription
                              ?.plan.name ??
                              payment.reference ??
                              "Cobro manual"}
                          </span>

                          {latestFlowOrder && (
                            <span
                              className={
                                styles.secondaryText
                              }
                            >
                              Flow:{" "}
                              {getFlowStatusLabel(
                                latestFlowOrder.status,
                              )}

                              {latestFlowOrder.flowOrder
                                ? ` · Orden ${latestFlowOrder.flowOrder}`
                                : ""}
                            </span>
                          )}
                        </td>

                        <td>
                          <span
                            className={`${
                              styles.recordBadge
                            } ${
                              isTest
                                ? styles.recordTest
                                : styles.recordReal
                            }`}
                          >
                            {isTest
                              ? "Prueba"
                              : "Real"}
                          </span>
                        </td>

                        <td>
                          {formatDate(
                            payment.dueDate,
                          )}
                        </td>

                        <td>
                          <strong
                            className={
                              styles.price
                            }
                          >
                            {formatCurrency(
                              payment.amount,
                            )}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`${
                              styles.status
                            } ${
                              styles[
                                `status${payment.status
                                  .charAt(
                                    0,
                                  )
                                  .toUpperCase()}${payment.status
                                  .slice(
                                    1,
                                  )
                                  .toLowerCase()}`
                              ] ?? ""
                            }`}
                          >
                            {getPaymentStatusLabel(
                              payment.status,
                            )}
                          </span>
                        </td>

                        <td>
                          {payment.method
                            ? getPaymentMethodLabel(
                                payment.method,
                              )
                            : latestFlowOrder
                              ? `Flow · ${getFlowStatusLabel(
                                  latestFlowOrder.status,
                                )}`
                              : "Sin registrar"}
                        </td>

                        <td>
                          {formatDate(
                            payment.paidAt,
                          )}
                        </td>

                        <td>
                          <div
                            className={
                              styles.actions
                            }
                          >
                            {canManage && (
                              <>
                                {hasPendingFlowLink &&
                                latestFlowOrder
                                  ?.paymentUrl ? (
                                  <a
                                    className={
                                      styles.primaryAction
                                    }
                                    href={
                                      latestFlowOrder.paymentUrl
                                    }
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Abrir Flow
                                  </a>
                                ) : (
                                  <FlowPaymentButton
                                    paymentId={
                                      payment.id
                                    }
                                  />
                                )}

                                <PaymentForm
                                  amount={Number(
                                    payment.amount,
                                  )}
                                  clientName={
                                    payment.client
                                      .businessName
                                  }
                                  description={
                                    payment.description
                                  }
                                  paymentId={
                                    payment.id
                                  }
                                />

                                <form
                                  action={
                                    cancelPaymentWithId
                                  }
                                >
                                  <button
                                    className={
                                      styles.dangerAction
                                    }
                                    type="submit"
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </>
                            )}

                            {payment.status ===
                              "PAID" &&
                              !isTest && (
                              <PaymentEmailManager
                                amount={Number(
                                  payment.amount,
                                )}
                                clientEmail={
                                  payment.client
                                    .email
                                }
                                clientName={
                                  payment.client
                                    .businessName
                                }
                                description={
                                  payment.description
                                }
                                invoice={
                                  payment.invoice
                                    ? {
                                        invoiceNumber:
                                          payment
                                            .invoice
                                            .invoiceNumber,
                                        issueDate:
                                          formatDateInput(
                                            payment
                                              .invoice
                                              .issueDate,
                                          ),
                                        recipientName:
                                          payment
                                            .invoice
                                            .recipientName,
                                        recipientEmail:
                                          payment
                                            .invoice
                                            .recipientEmail,
                                        serviceDescription:
                                          payment
                                            .invoice
                                            .serviceDescription,
                                        netAmount:
                                          Number(
                                            payment
                                              .invoice
                                              .netAmount,
                                          ),
                                        taxAmount:
                                          Number(
                                            payment
                                              .invoice
                                              .taxAmount,
                                          ),
                                        totalAmount:
                                          Number(
                                            payment
                                              .invoice
                                              .totalAmount,
                                          ),
                                        paymentCondition:
                                          null,
                                        fileName:
                                          payment
                                            .invoice
                                            .fileName,
                                        emailStatus:
                                          payment
                                            .invoice
                                            .emailStatus,
                                        lastError:
                                          payment
                                            .invoice
                                            .lastError,
                                      }
                                    : null
                                }
                                paidAt={
                                  payment.paidAt
                                    ? formatDateInput(
                                        payment.paidAt,
                                      )
                                    : null
                                }
                                paymentId={
                                  payment.id
                                }
                                paymentMethod={
                                  payment.method
                                }
                                receipt={
                                  payment.receipt
                                    ? {
                                        number:
                                          payment
                                            .receipt
                                            .number,
                                        recipientName:
                                          payment
                                            .receipt
                                            .recipientName,
                                        recipientEmail:
                                          payment
                                            .receipt
                                            .recipientEmail,
                                        serviceDescription:
                                          payment
                                            .receipt
                                            .serviceDescription,
                                        projectReference:
                                          payment
                                            .receipt
                                            .projectReference,
                                        coveragePeriod:
                                          payment
                                            .receipt
                                            .coveragePeriod,
                                        paymentReference:
                                          payment
                                            .receipt
                                            .paymentReference,
                                        netAmount:
                                          Number(
                                            payment
                                              .receipt
                                              .netAmount,
                                          ),
                                        taxAmount:
                                          Number(
                                            payment
                                              .receipt
                                              .taxAmount,
                                          ),
                                        totalAmount:
                                          Number(
                                            payment
                                              .receipt
                                              .totalAmount,
                                          ),
                                        balanceAmount:
                                          0,
                                        emailStatus:
                                          payment
                                            .receipt
                                            .emailStatus,
                                        lastError:
                                          payment
                                            .receipt
                                            .lastError,
                                      }
                                    : null
                                }
                              />
                            )}

                            <Link
                              className={
                                styles.viewButton
                              }
                              href={`/clientes/${payment.clientId}`}
                            >
                              Ver cliente
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
