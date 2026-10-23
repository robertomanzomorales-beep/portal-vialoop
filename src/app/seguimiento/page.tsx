import { prisma } from "@/lib/prisma";
import {
  getProspectStatusLabel,
  parseProspectMetadata,
  prospectStatuses,
} from "@/lib/prospect";
import ProspectManager, {
  type ProspectRecord,
} from "./ProspectManager";
import styles from "./seguimiento.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function addDays(
  dateKey: string,
  days: number,
) {
  const date = new Date(
    `${dateKey}T12:00:00Z`,
  );
  date.setUTCDate(
    date.getUTCDate() + days,
  );
  return date.toISOString().slice(0, 10);
}

function formatAgendaDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);

  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replaceAll(".", "");
}

export default async function FollowUpPage() {
  const logs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Prospect",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

  const prospects: ProspectRecord[] = logs
    .map((log) => ({
      id: log.id,
      createdAt:
        log.createdAt.toISOString(),
      metadata:
        parseProspectMetadata(
          log.metadata,
        ),
    }))
    .filter(
      (item): item is ProspectRecord =>
        Boolean(item.metadata),
    )
    .sort((first, second) => {
      const firstDate =
        first.metadata.nextFollowUp ||
        "9999-12-31";
      const secondDate =
        second.metadata.nextFollowUp ||
        "9999-12-31";

      return firstDate.localeCompare(
        secondDate,
      );
    });

  const today =
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    }).format(new Date());
  const weekLimit = addDays(today, 7);
  const openProspects = prospects.filter(
    ({ metadata }) =>
      metadata.status !== "WON" &&
      metadata.status !== "LOST",
  );
  const overdue = openProspects.filter(
    ({ metadata }) =>
      metadata.nextFollowUp &&
      metadata.nextFollowUp < today,
  ).length;
  const todayCount = openProspects.filter(
    ({ metadata }) =>
      metadata.nextFollowUp === today,
  ).length;
  const nextSevenDays =
    openProspects.filter(
      ({ metadata }) =>
        metadata.nextFollowUp > today &&
        metadata.nextFollowUp <=
          weekLimit,
    ).length;
  const won = prospects.filter(
    ({ metadata }) =>
      metadata.status === "WON",
  ).length;

  const agendaProspects = openProspects
    .filter(
      ({ metadata }) =>
        Boolean(metadata.nextFollowUp),
    )
    .slice(0, 8);

  const industryCounts = Array.from(
    prospects.reduce((counts, item) => {
      const industry =
        item.metadata.industry ||
        "Sin clasificar";
      counts.set(
        industry,
        (counts.get(industry) ?? 0) + 1,
      );
      return counts;
    }, new Map<string, number>()),
  )
    .sort(
      (first, second) =>
        second[1] - first[1],
    )
    .slice(0, 6);

  const statusCounts = prospectStatuses.map(
    (status) => ({
      status,
      count: prospects.filter(
        ({ metadata }) =>
          metadata.status === status,
      ).length,
    }),
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            CRM Vialoop
          </span>
          <h1>Seguimiento comercial</h1>
          <p>
            Ordena prospectos, agenda próximos contactos y prepara mensajes de seguimiento para convertir más oportunidades.
          </p>
        </div>

        <a
          className={styles.exportButton}
          href="/api/seguimiento/exportar"
        >
          Descargar CSV
        </a>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Oportunidades activas</span>
          <strong>
            {openProspects.length}
          </strong>
          <small>
            {prospects.length} en total
          </small>
        </article>
        <article
          className={
            overdue > 0
              ? styles.metricAlert
              : undefined
          }
        >
          <span>Seguimientos vencidos</span>
          <strong>{overdue}</strong>
          <small>
            Requieren atención
          </small>
        </article>
        <article>
          <span>Para hoy</span>
          <strong>{todayCount}</strong>
          <small>
            {nextSevenDays} próximos 7 días
          </small>
        </article>
        <article>
          <span>Oportunidades ganadas</span>
          <strong>{won}</strong>
          <small>
            {prospects.length > 0
              ? `${Math.round((won / prospects.length) * 100)}% del total`
              : "Sin datos aún"}
          </small>
        </article>
      </section>

      {agendaProspects.length > 0 && (
        <section className={styles.agendaPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Agenda comercial</span>
              <h2>Próximos seguimientos</h2>
            </div>

            <span>{agendaProspects.length} contactos priorizados</span>
          </div>

          <div className={styles.agendaList}>
            {agendaProspects.map(({ id, metadata }) => {
              const tone = metadata.nextFollowUp < today
                ? styles.agendaOverdue
                : metadata.nextFollowUp === today
                  ? styles.agendaToday
                  : styles.agendaUpcoming;

              return (
                <article className={tone} key={id}>
                  <time dateTime={metadata.nextFollowUp}>
                    {formatAgendaDate(metadata.nextFollowUp)}
                  </time>

                  <div>
                    <strong>{metadata.company}</strong>
                    <span>
                      {metadata.contactName || "Contacto por definir"}
                      {metadata.assignedTo ? ` · ${metadata.assignedTo}` : ""}
                    </span>
                  </div>

                  <small>{getProspectStatusLabel(metadata.status)}</small>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {prospects.length > 0 && (
        <section
          className={styles.insightsGrid}
        >
          <article>
            <div
              className={styles.panelHeader}
            >
              <div>
                <span
                  className={styles.eyebrow}
                >
                  Distribución
                </span>
                <h2>Pipeline por estado</h2>
              </div>
            </div>

            <div
              className={styles.barList}
            >
              {statusCounts.map(
                ({ status, count }) => (
                  <div key={status}>
                    <span>
                      {getProspectStatusLabel(
                        status,
                      )}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(4, (count / prospects.length) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                ),
              )}
            </div>
          </article>

          <article>
            <div
              className={styles.panelHeader}
            >
              <div>
                <span
                  className={styles.eyebrow}
                >
                  Segmentación
                </span>
                <h2>Principales industrias</h2>
              </div>
            </div>

            <div
              className={styles.industryList}
            >
              {industryCounts.map(
                ([industry, count]) => (
                  <div key={industry}>
                    <span>{industry}</span>
                    <strong>{count}</strong>
                  </div>
                ),
              )}
            </div>
          </article>
        </section>
      )}

      <ProspectManager
        prospects={prospects}
      />
    </main>
  );
}
