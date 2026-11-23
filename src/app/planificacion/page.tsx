import { prisma } from "@/lib/prisma";
import { parseScheduledTaskMetadata } from "@/lib/scheduled-task";
import PlanningManager, { type ScheduledTaskRecord } from "./PlanningManager";
import styles from "./planificacion.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function chileDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date());
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function PlanningPage() {
  const [logs, clients] = await Promise.all([
    prisma.activityLog.findMany({
      where: { entityType: "ScheduledTask" },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.client.findMany({
      where: { status: "ACTIVE" },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, tradeName: true },
    }),
  ]);
  const tasks: ScheduledTaskRecord[] = logs
    .map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      metadata: parseScheduledTaskMetadata(log.metadata),
    }))
    .filter((task): task is ScheduledTaskRecord => Boolean(task.metadata));
  const today = chileDateKey();
  const nextSevenDays = addDays(today, 7);
  const active = tasks.filter((task) => task.metadata.status !== "COMPLETED");
  const overdue = active.filter((task) => task.metadata.dueDate < today);
  const immediate = active.filter(
    (task) => task.metadata.dueDate >= today && task.metadata.dueDate <= nextSevenDays,
  );
  const completed = tasks.filter((task) => task.metadata.status === "COMPLETED");

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Operación y fechas</span>
          <h1>Planificación</h1>
          <p>
            Registra trabajos, responsables y plazos o importa una carta Gantt desde Excel.
          </p>
        </div>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Trabajos activos</span>
          <strong>{active.length}</strong>
          <small>En agenda operativa</small>
        </article>
        <article className={overdue.length ? styles.metricAlert : undefined}>
          <span>Atrasados</span>
          <strong>{overdue.length}</strong>
          <small>Plazos vencidos</small>
        </article>
        <article>
          <span>Próximos 7 días</span>
          <strong>{immediate.length}</strong>
          <small>Prioridad inmediata</small>
        </article>
        <article>
          <span>Completados</span>
          <strong>{completed.length}</strong>
          <small>Historial registrado</small>
        </article>
      </section>

      <PlanningManager
        clients={clients.map((client) => ({
          id: client.id,
          name: client.tradeName || client.businessName,
        }))}
        tasks={tasks}
        today={today}
      />
    </main>
  );
}
