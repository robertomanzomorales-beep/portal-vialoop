import { prisma } from "@/lib/prisma";
import { parseExpenseMetadata } from "@/lib/expense";
import {
  getScheduledTaskStatusLabel,
  parseScheduledTaskMetadata,
} from "@/lib/scheduled-task";
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

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function quotationTerm(issuedAt: string, validUntil: string) {
  const start = new Date(`${issuedAt}T12:00:00Z`).getTime();
  const end = new Date(`${validUntil}T12:00:00Z`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Plazo no informado";
  }

  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  return `Plazo ${days} día${days === 1 ? "" : "s"}`;
}

export default async function FollowUpPage() {
  await syncSentQuotationsToFollowUp();

  const [logs, expenseLogs, taskLogs, renewals, payments, supportRequests] =
    await Promise.all([
      prisma.activityLog.findMany({
      where: {
        entityType: "Prospect",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
      }),
      prisma.activityLog.findMany({
        where: { entityType: "Expense" },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.activityLog.findMany({
        where: { entityType: "ScheduledTask" },
        orderBy: { createdAt: "desc" },
        take: 1000,
        include: {
          client: { select: { businessName: true, tradeName: true } },
          project: { select: { name: true, domain: true } },
        },
      }),
      prisma.renewal.findMany({
        where: {
          status: { in: ["UPCOMING", "NOTIFIED", "EXPIRED"] },
          client: { status: "ACTIVE" },
        },
        include: {
          client: { select: { businessName: true, tradeName: true } },
          project: { select: { name: true, domain: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 500,
      }),
      prisma.payment.findMany({
        where: {
          status: { in: ["PENDING", "OVERDUE"] },
          dueDate: { not: null },
          client: { status: "ACTIVE" },
        },
        include: {
          client: { select: { businessName: true, tradeName: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 500,
      }),
      prisma.supportRequest.findMany({
        where: {
          status: { notIn: ["COMPLETED", "REJECTED", "OUT_OF_SCOPE"] },
          estimatedDelivery: { not: null },
        },
        include: {
          client: { select: { businessName: true, tradeName: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { estimatedDelivery: "asc" },
        take: 500,
      }),
    ]);

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
  const prospectCalendarEntries: FollowUpCalendarEntry[] =
    openProspects.flatMap(
      ({ id, metadata }) => {
        const status =
          getProspectStatusLabel(
            metadata.status,
          );
        const followUpEntry =
          metadata.nextFollowUp
            ? [
                {
                  id: `${id}-follow-up`,
                  prospectId: id,
                  kind: "FOLLOW_UP" as const,
                  company: metadata.company,
                  date: metadata.nextFollowUp,
                  status,
                  assignedTo:
                    metadata.assignedTo,
                  quotationNumber:
                    metadata.quotations[0]
                      ?.number || "",
                },
              ]
            : [];
        const quotationDeadlines =
          metadata.quotations
            .filter((quotation) =>
              Boolean(quotation.validUntil),
            )
            .map((quotation) => ({
              id: `${id}-quotation-${quotation.id}`,
              prospectId: id,
              kind:
                "QUOTATION_DEADLINE" as const,
              company: metadata.company,
              date: quotation.validUntil,
              status: `${quotationTerm(quotation.issuedAt, quotation.validUntil)} · ${formatCurrency(quotation.totalAmount)}`,
              assignedTo:
                metadata.assignedTo,
              quotationNumber:
                quotation.number,
            }));

        return [
          ...followUpEntry,
          ...quotationDeadlines,
        ];
      },
    );
  const expenseCalendarEntries: FollowUpCalendarEntry[] = expenseLogs.flatMap((log) => {
    const expense = parseExpenseMetadata(log.metadata);
    if (!expense?.active || !expense.nextDueDate) return [];
    return [{
      id: `expense-${log.id}`,
      kind: "EXPENSE" as const,
      company: expense.concept,
      date: expense.nextDueDate,
      status: `${formatCurrency(expense.amount)} · ${expense.category === "VIALOOP" ? "Vialoop" : "Casa"}`,
      assignedTo: "Finanzas",
      quotationNumber: "",
      href: "/gastos",
    }];
  });
  const renewalCalendarEntries: FollowUpCalendarEntry[] = renewals.map((renewal) => ({
    id: `renewal-${renewal.id}`,
    kind: "RENEWAL",
    company: renewal.client.tradeName || renewal.client.businessName,
    date: renewal.dueDate.toISOString().slice(0, 10),
    status: renewal.project?.domain || renewal.project?.name || renewal.description,
    assignedTo: "Renovaciones",
    quotationNumber: "",
    href: "/renovaciones",
  }));
  const taskCalendarEntries: FollowUpCalendarEntry[] = taskLogs.flatMap((log) => {
    const task = parseScheduledTaskMetadata(log.metadata);
    if (!task || task.status === "COMPLETED" || !task.dueDate) return [];
    const clientName = log.client
      ? log.client.tradeName || log.client.businessName
      : task.clientName;
    const projectName = log.project
      ? log.project.domain || log.project.name
      : task.projectName;
    return [{
      id: `task-${log.id}`,
      kind: "TASK" as const,
      company: task.title,
      date: task.dueDate,
      status: [getScheduledTaskStatusLabel(task.status), clientName, projectName]
        .filter(Boolean)
        .join(" · "),
      assignedTo: task.responsible || "Equipo",
      quotationNumber: "",
      href: "/planificacion",
    }];
  });
  const paymentCalendarEntries: FollowUpCalendarEntry[] = payments.flatMap((payment) =>
    payment.dueDate
      ? [{
          id: `payment-${payment.id}`,
          kind: "PAYMENT" as const,
          company: payment.client.tradeName || payment.client.businessName,
          date: payment.dueDate.toISOString().slice(0, 10),
          status: `${formatCurrency(payment.amount)} · ${payment.description}`,
          assignedTo: "Cobros",
          quotationNumber: "",
          href: "/pagos",
        }]
      : [],
  );
  const supportCalendarEntries: FollowUpCalendarEntry[] = supportRequests.flatMap((request) =>
    request.estimatedDelivery
      ? [{
          id: `support-${request.id}`,
          kind: "SUPPORT" as const,
          company: request.client?.tradeName || request.client?.businessName || `Solicitud #${request.number}`,
          date: request.estimatedDelivery.toISOString().slice(0, 10),
          status: request.subject,
          assignedTo: request.assignedTo?.name || "Equipo",
          quotationNumber: "",
          href: `/solicitudes/${request.id}`,
        }]
      : [],
  );
  const calendarEntries = [
    ...prospectCalendarEntries,
    ...expenseCalendarEntries,
    ...taskCalendarEntries,
    ...renewalCalendarEntries,
    ...paymentCalendarEntries,
    ...supportCalendarEntries,
  ];

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
