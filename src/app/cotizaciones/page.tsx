import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseQuotationMetadata } from "@/lib/quotation";
import AcceptQuotationButton from "./AcceptQuotationButton";
import DeleteQuotationButton from "./DeleteQuotationButton";
import QuotationForm, {
  type QuotationFormInitialValue,
} from "./QuotationForm";
import styles from "./cotizaciones.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatDateKey(value: string) {
  if (!value) return "Sin plazo";

  const date = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function quotationTerm(issuedAt: string, validUntil: string) {
  const start = new Date(`${issuedAt}T12:00:00.000Z`).getTime();
  const end = new Date(`${validUntil}T12:00:00.000Z`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Plazo no informado";

  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  return `${days} día${days === 1 ? "" : "s"} de vigencia`;
}

type QuotationsPageProps = {
  searchParams: Promise<{
    cliente?: string;
    editar?: string;
    duplicar?: string;
  }>;
};

export default async function QuotationsPage({
  searchParams,
}: QuotationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const sourceId = resolvedSearchParams.editar || resolvedSearchParams.duplicar || "";
  const [clients, logs, sourceLog] =
    await Promise.all([
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
          mainContactName: true,
          email: true,
        },
      }),
      prisma.activityLog.findMany({
        where: {
          entityType: "Quotation",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      }),
      sourceId
        ? prisma.activityLog.findFirst({
            where: {
              id: sourceId,
              entityType: "Quotation",
            },
          })
        : Promise.resolve(null),
    ]);

  const quotations = logs
    .map((log) => ({
      log,
      metadata:
        parseQuotationMetadata(
          log.metadata,
        ),
    }))
    .filter(
      (item): item is {
        log: (typeof logs)[number];
        metadata: NonNullable<
          ReturnType<
            typeof parseQuotationMetadata
          >
        >;
      } => Boolean(item.metadata),
    );

  const sentCount = quotations.filter(
    (item) =>
      item.metadata.emailStatus === "SENT",
  ).length;

  const quotedAmount = quotations.reduce(
    (sum, item) =>
      sum + item.metadata.totalAmount,
    0,
  );
  const paymentReferences = quotations.map(
    ({ log }) => `quotation:${log.id}`,
  );
  const linkedPaymentIds = quotations
    .map(({ metadata }) => metadata.flowPaymentId)
    .filter((id): id is string => Boolean(id));
  const quotationPayments =
    paymentReferences.length > 0
      ? await prisma.payment.findMany({
          where: {
            OR: [
              { reference: { in: paymentReferences } },
              ...(linkedPaymentIds.length > 0
                ? [{ id: { in: linkedPaymentIds } }]
                : []),
            ],
          },
          include: {
            flowOrders: {
              where: { status: "PENDING" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const paymentByQuotation = new Map<string, (typeof quotationPayments)[number]>();

  for (const payment of quotationPayments) {
    const quotationId = payment.reference?.startsWith("quotation:")
      ? payment.reference.replace("quotation:", "")
      : quotations.find(({ metadata }) => metadata.flowPaymentId === payment.id)?.log.id;

    if (quotationId && !paymentByQuotation.has(quotationId)) {
      paymentByQuotation.set(quotationId, payment);
    }
  }

  const acceptedCount = quotations.filter(({ log, metadata }) => {
    const payment = paymentByQuotation.get(log.id);
    return (
      metadata.commercialStatus === "ACCEPTED" ||
      metadata.commercialStatus === "PAID" ||
      payment?.status === "PAID"
    );
  }).length;
  const sourceMetadata = sourceLog
    ? parseQuotationMetadata(sourceLog.metadata)
    : null;
  const initialValue: QuotationFormInitialValue | undefined =
    sourceLog && sourceMetadata
      ? {
          id: sourceLog.id,
          mode: resolvedSearchParams.editar ? "EDIT" : "DUPLICATE",
          metadata: sourceMetadata,
        }
      : undefined;
  const defaultClientId = clients.some(
    (client) => client.id === resolvedSearchParams.cliente,
  )
    ? resolvedSearchParams.cliente
    : undefined;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Gestión comercial
          </span>
          <h1>Cotizaciones</h1>
          <p>
            Crea propuestas con cálculo automático de IVA, PDF Vialoop y envío profesional por correo.
          </p>
        </div>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Cotizaciones registradas</span>
          <strong>{quotations.length}</strong>
        </article>
        <article>
          <span>Aceptadas</span>
          <strong>{acceptedCount}</strong>
          <small>{sentCount} enviadas correctamente</small>
        </article>
        <article>
          <span>Total cotizado</span>
          <strong>{formatCurrency(quotedAmount)}</strong>
        </article>
      </section>

      <QuotationForm
        key={
          initialValue
            ? `${initialValue.mode}-${initialValue.id}`
            : `new-${defaultClientId ?? "blank"}`
        }
        clients={clients.map((client) => ({
          id: client.id,
          name:
            client.tradeName ||
            client.businessName,
          contactName:
            client.mainContactName ?? "",
          email: client.email ?? "",
        }))}
        defaultClientId={defaultClientId}
        initialValue={initialValue}
      />

      <section className={styles.historyPanel}>
        <div className={styles.historyHeader}>
          <div>
            <span className={styles.eyebrow}>
              Historial
            </span>
            <h2>Últimas cotizaciones</h2>
          </div>
        </div>

        {quotations.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Aún no existen cotizaciones</strong>
            <p>La primera propuesta enviada aparecerá en este historial.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Proyecto</th>
                  <th>Total</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {quotations.map(
                  ({ log, metadata }) => {
                    const payment = paymentByQuotation.get(log.id);
                    const isPaid =
                      metadata.commercialStatus === "PAID" ||
                      payment?.status === "PAID";
                    const isAccepted =
                      !isPaid && metadata.commercialStatus === "ACCEPTED";
                    const canAccept =
                      metadata.commercialStatus === "SENT" &&
                      metadata.emailStatus === "SENT";
                    const flowUrl =
                      payment?.flowOrders[0]?.paymentUrl ||
                      metadata.flowPaymentUrl;

                    return (
                    <tr key={log.id}>
                      <td>
                        <strong>{metadata.number}</strong>
                      </td>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>
                        <strong>{metadata.clientName}</strong>
                        <small>{metadata.recipientEmail}</small>
                      </td>
                      <td>
                        <strong>
                          {metadata.referenceName || metadata.projectName || "Propuesta general"}
                        </strong>
                        {metadata.referenceName && metadata.projectName ? (
                          <small>{metadata.projectName}</small>
                        ) : null}
                      </td>
                      <td>
                        <strong>
                          {formatCurrency(metadata.totalAmount)}
                        </strong>
                      </td>
                      <td>
                        <strong>{formatDateKey(metadata.validUntil)}</strong>
                        <small>{quotationTerm(metadata.issuedAt, metadata.validUntil)}</small>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${
                            isPaid
                              ? styles.statusPaid
                              : isAccepted
                                ? styles.statusAccepted
                                : metadata.emailStatus === "FAILED"
                                ? styles.statusFailed
                                : metadata.emailStatus === "SENT"
                                  ? styles.statusSent
                                  : styles.statusPending
                          }`}
                        >
                          {isPaid
                            ? "Pagada"
                            : isAccepted
                              ? "Aceptada · pago pendiente"
                              : metadata.emailStatus === "FAILED"
                              ? "Error"
                              : metadata.emailStatus === "SENT"
                                ? "Enviada · por aceptar"
                                : "Pendiente"}
                        </span>
                        {metadata.acceptedBy ? (
                          <small>Aceptó {metadata.acceptedBy}</small>
                        ) : null}
                      </td>
                      <td>
                        <div
                          className={styles.historyActions}
                        >
                          <Link
                            className={styles.pdfLink}
                            href={`/api/cotizaciones/${log.id}/pdf`}
                            target="_blank"
                          >
                            Ver PDF
                          </Link>
                          {!isAccepted && !isPaid ? (
                            <Link
                              className={styles.secondaryHistoryAction}
                              href={`/cotizaciones?editar=${log.id}`}
                            >
                              Editar
                            </Link>
                          ) : null}
                          <Link
                            className={styles.secondaryHistoryAction}
                            href={`/cotizaciones?duplicar=${log.id}`}
                          >
                            Duplicar
                          </Link>
                          {canAccept ? (
                            <AcceptQuotationButton
                              quotationId={log.id}
                              quotationNumber={metadata.number}
                            />
                          ) : null}
                          <DeleteQuotationButton
                            quotationId={log.id}
                            quotationNumber={
                              metadata.number
                            }
                          />
                          {isAccepted || isPaid ? (
                            <Link
                              className={styles.secondaryHistoryAction}
                              href="/pagos"
                            >
                              Ver cobro
                            </Link>
                          ) : null}
                          {isAccepted && flowUrl ? (
                            <a
                              className={styles.flowLink}
                              href={flowUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir pago · cuotas
                            </a>
                          ) : null}
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
