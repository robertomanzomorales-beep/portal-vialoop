import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseQuotationMetadata } from "@/lib/quotation";
import DeleteQuotationButton from "./DeleteQuotationButton";
import QuotationForm from "./QuotationForm";
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

export default async function QuotationsPage() {
  const [clients, logs] =
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
          <span>Enviadas correctamente</span>
          <strong>{sentCount}</strong>
        </article>
        <article>
          <span>Total cotizado</span>
          <strong>{formatCurrency(quotedAmount)}</strong>
        </article>
      </section>

      <QuotationForm
        clients={clients.map((client) => ({
          id: client.id,
          name:
            client.tradeName ||
            client.businessName,
          contactName:
            client.mainContactName ?? "",
          email: client.email ?? "",
        }))}
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
                  <th>Envío</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {quotations.map(
                  ({ log, metadata }) => (
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
                        {metadata.projectName || "Propuesta general"}
                      </td>
                      <td>
                        <strong>
                          {formatCurrency(metadata.totalAmount)}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${
                            metadata.emailStatus === "SENT"
                              ? styles.statusSent
                              : metadata.emailStatus === "FAILED"
                                ? styles.statusFailed
                                : styles.statusPending
                          }`}
                        >
                          {metadata.emailStatus === "SENT"
                            ? "Enviada"
                            : metadata.emailStatus === "FAILED"
                              ? "Error"
                              : "Pendiente"}
                        </span>
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
                          <DeleteQuotationButton
                            quotationId={log.id}
                            quotationNumber={
                              metadata.number
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
