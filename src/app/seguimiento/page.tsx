import { prisma } from "@/lib/prisma";
import {
  getProspectStatusLabel,
  parseProspectMetadata,
} from "@/lib/prospect";
import { syncSentQuotationsToFollowUp } from "@/lib/quotation-follow-up";
import FollowUpCalendar, {
  type FollowUpCalendarEntry,
} from "./FollowUpCalendar";
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

export default async function FollowUpPage() {
  await syncSentQuotationsToFollowUp();

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
  const calendarEntries: FollowUpCalendarEntry[] =
    openProspects
      .filter(({ metadata }) =>
        Boolean(metadata.nextFollowUp),
      )
      .map(({ id, metadata }) => ({
        id,
        company: metadata.company,
        date: metadata.nextFollowUp,
        status:
          getProspectStatusLabel(
            metadata.status,
          ),
        assignedTo:
          metadata.assignedTo,
        quotationNumber:
          metadata.quotations[0]
            ?.number || "",
      }));

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            Gestión comercial
          </span>
          <h1>Seguimiento</h1>
          <p>
            Organiza contactos, cotizaciones y próximos pasos desde una agenda comercial única.
          </p>
        </div>

        <a
          className={styles.exportButton}
          href="/api/seguimiento/exportar"
        >
          Exportar CSV
        </a>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Oportunidades activas</span>
          <strong>
            {openProspects.length}
          </strong>
          <small>
            {prospects.length} registros en total
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
            {overdue > 0
              ? "Requieren una nueva gestión"
              : "Agenda al día"}
          </small>
        </article>

        <article>
          <span>Agenda inmediata</span>
          <strong>{todayCount}</strong>
          <small>
            Hoy · {nextSevenDays} próximos 7 días
          </small>
        </article>

        <article>
          <span>Oportunidades ganadas</span>
          <strong>{won}</strong>
          <small>
            {prospects.length > 0
              ? `${Math.round((won / prospects.length) * 100)}% de conversión registrada`
              : "Sin datos todavía"}
          </small>
        </article>
      </section>

      <FollowUpCalendar
        entries={calendarEntries}
      />

      <ProspectManager
        prospects={prospects}
      />
    </main>
  );
}
