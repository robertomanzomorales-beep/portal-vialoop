import { prisma } from "@/lib/prisma";
import { parseScheduledTaskMetadata } from "@/lib/scheduled-task";
import PlanningManager, { type ScheduledTaskRecord } from "./PlanningManager";
import styles from "./planificacion.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlanningPageProps = {
  searchParams: Promise<{ cliente?: string }>;
};

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

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const { cliente } = await searchParams;
  const [logs, clients, projects] = await Promise.all([
    prisma.activityLog.findMany({
      where: { entityType: "ScheduledTask" },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        client: {
          select: { id: true, businessName: true, tradeName: true },
        },
        project: {
          select: { id: true, name: true, domain: true, clientId: true },
        },
      },
    }),
    prisma.client.findMany({
      where: { status: "ACTIVE" },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, tradeName: true },
    }),
    prisma.project.findMany({
      where: {
        client: { status: "ACTIVE" },
      },
      orderBy: [{ client: { businessName: "asc" } }, { name: "asc" }],
      select: { id: true, clientId: true, name: true, domain: true },
    }),
  ]);
  const tasks: ScheduledTaskRecord[] = logs
    .map((log) => {
      const metadata = parseScheduledTaskMetadata(log.metadata);
      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        metadata: metadata
          ? {
              ...metadata,
              clientId: log.client?.id ?? metadata.clientId,
              clientName: log.client
                ? log.client.tradeName || log.client.businessName
                : metadata.clientName,
              projectId: log.project?.id ?? metadata.projectId,
              projectName: log.project
                ? log.project.domain || log.project.name
                : metadata.projectName,
            }
          : null,
      };
    })
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
          <h1>Agenda operativa</h1>
          <p>
            Organiza trabajos y plazos usando la ficha única de cada cliente.
            El proyecto es opcional y solo se usa cuando aporta contexto técnico.
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
        initialClientId={
          cliente && clients.some((client) => client.id === cliente) ? cliente : ""
        }
        projects={projects.map((project) => ({
          id: project.id,
          clientId: project.clientId,
          name: project.domain || project.name,
        }))}
        tasks={tasks}
        today={today}
      />
    </main>
  );
}
