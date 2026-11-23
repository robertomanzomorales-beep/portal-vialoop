"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  getClientOperationSummary,
  type ClientOperationTaskRecord,
} from "@/lib/client-operation";
import {
  clientOperationServiceTypes,
  getClientOperationServiceTypeLabel,
  getScheduledTaskStatusLabel,
  scheduledTaskStatuses,
  type ScheduledTaskStatus,
} from "@/lib/scheduled-task";
import { setTaskStatus } from "@/app/planificacion/actions";
import {
  startClientOperation,
  type ClientOperationActionState,
} from "./actions";
import styles from "./clientes.module.css";

type TeamMember = {
  id: string;
  name: string;
};

type ClientOperationBoardProps = {
  clientId: string;
  clientName: string;
  defaultServiceName: string;
  tasks: ClientOperationTaskRecord[];
  teamMembers: TeamMember[];
  currentUserId: string;
  today: string;
};

const initialState: ClientOperationActionState = {
  ok: false,
  message: "",
};

function date(value: string) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00.000Z`))
    .replace(".", "");
}

function targetDate(today: string) {
  const result = new Date(`${today}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 30);
  return result.toISOString().slice(0, 10);
}

function health(summary: ReturnType<typeof getClientOperationSummary>) {
  if (summary.finished) return { label: "Finalizado", tone: "complete" };
  if (summary.blocked > 0) return { label: "Bloqueado", tone: "blocked" };
  if (summary.overdue > 0) return { label: "Con atraso", tone: "late" };
  if (summary.waitingClient > 0) {
    return { label: "Esperando al cliente", tone: "waiting" };
  }
  return { label: "En curso", tone: "active" };
}

export default function ClientOperationBoard({
  clientId,
  clientName,
  defaultServiceName,
  tasks,
  teamMembers,
  currentUserId,
  today,
}: ClientOperationBoardProps) {
  const router = useRouter();
  const startAction = startClientOperation.bind(null, clientId);
  const [startState, formAction, startPending] = useActionState(
    startAction,
    initialState,
  );
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, ScheduledTaskStatus>
  >({});

  useEffect(() => {
    if (startState.ok) {
      router.refresh();
    }
  }, [router, startState.ok]);

  const summary = useMemo(
    () => getClientOperationSummary(tasks, today),
    [tasks, today],
  );
  const operationHealth = health(summary);

  function changeStatus(taskId: string, nextStatus: ScheduledTaskStatus) {
    const task = tasks.find((item) => item.id === taskId);
    const previousStatus =
      statusOverrides[taskId] ?? task?.metadata.status ?? "PENDING";
    setStatusOverrides((current) => ({
      ...current,
      [taskId]: nextStatus,
    }));
    setPendingId(taskId);
    setFeedback("");

    startTransition(async () => {
      try {
        const result = await setTaskStatus(taskId, nextStatus);
        setFeedback(result.message);

        if (result.ok) {
          router.refresh();
        } else {
          setStatusOverrides((current) => ({
            ...current,
            [taskId]: previousStatus,
          }));
        }
      } catch {
        setStatusOverrides((current) => ({
          ...current,
          [taskId]: previousStatus,
        }));
        setFeedback("No fue posible actualizar la etapa.");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (tasks.length === 0) {
    return (
      <section className={styles.operationBoardEmpty}>
        <div>
          <span className={styles.eyebrow}>Control operativo</span>
          <h2>Activa un flujo de implementación</h2>
          <p>
            Este cliente todavía no tiene un proceso controlado. Al activarlo,
            los hitos aparecerán aquí, en la Agenda operativa y en Seguimiento.
          </p>
        </div>

        <form action={formAction} className={styles.operationStartForm}>
          <label>
            <span>Tipo de servicio</span>
            <select defaultValue="WEB" name="serviceType" required>
              {clientOperationServiceTypes.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {getClientOperationServiceTypeLabel(serviceType)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.operationStartWide}>
            <span>Servicio o alcance</span>
            <input
              defaultValue={defaultServiceName}
              maxLength={160}
              name="serviceName"
              required
            />
          </label>
          <label>
            <span>Responsable</span>
            <select defaultValue={currentUserId} name="responsibleUserId" required>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fecha objetivo</span>
            <input
              defaultValue={targetDate(today)}
              min={today}
              name="operationTargetDate"
              required
              type="date"
            />
          </label>
          {startState.message ? (
            <p
              className={
                startState.ok
                  ? styles.operationFeedbackSuccess
                  : styles.operationFeedbackError
              }
            >
              {startState.message}
            </p>
          ) : null}
          <button className={styles.primaryButton} disabled={startPending} type="submit">
            {startPending ? "Creando flujo…" : `Iniciar operación para ${clientName}`}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.operationBoard}>
      <header className={styles.operationBoardHeader}>
        <div>
          <span className={styles.eyebrow}>Control operativo</span>
          <h2>{summary.serviceName}</h2>
          <p>
            {summary.serviceType} · Responsable actual: {summary.responsible}
          </p>
        </div>
        <div className={styles.operationBoardMeta}>
          <span className={styles[`operationHealth${operationHealth.tone}`]}>
            {operationHealth.label}
          </span>
          <strong>{summary.progress}%</strong>
          <small>Objetivo {date(summary.targetDate)}</small>
        </div>
      </header>

      <div className={styles.operationProgress}>
        <span style={{ width: `${summary.progress}%` }} />
      </div>

      <div className={styles.operationStageList}>
        {tasks.map((task) => {
          const status = statusOverrides[task.id] ?? task.metadata.status;
          const overdue = status !== "COMPLETED" && task.metadata.dueDate < today;

          return (
            <article className={styles.operationStage} key={task.id}>
              <span
                aria-hidden="true"
                className={`${styles.operationStageMarker} ${styles[`operationStageMarker${status}`]}`}
              />
              <div className={styles.operationStageMain}>
                <strong>{task.metadata.title}</strong>
                <small>{task.metadata.notes}</small>
              </div>
              <div className={overdue ? styles.operationStageLate : styles.operationStageDate}>
                <span>{overdue ? "Atrasada" : "Fecha límite"}</span>
                <strong>{date(task.metadata.dueDate)}</strong>
              </div>
              <label className={styles.operationStageStatus}>
                <span className={styles.srOnly}>Estado de {task.metadata.title}</span>
                <select
                  aria-label={`Estado de ${task.metadata.title}`}
                  disabled={isPending && pendingId === task.id}
                  onChange={(event) =>
                    changeStatus(
                      task.id,
                      event.target.value as ScheduledTaskStatus,
                    )
                  }
                  value={status}
                >
                  {scheduledTaskStatuses.map((item) => (
                    <option key={item} value={item}>
                      {getScheduledTaskStatusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          );
        })}
      </div>

      <footer className={styles.operationBoardFooter}>
        <div>
          <strong>Etapa actual: {summary.currentTitle}</strong>
          <span>
            {summary.completed} de {summary.total} hitos completados
            {feedback ? ` · ${feedback}` : ""}
          </span>
        </div>
        <Link className={styles.secondaryButton} href={`/planificacion?cliente=${clientId}`}>
          Abrir Agenda operativa
        </Link>
      </footer>
    </section>
  );
}

