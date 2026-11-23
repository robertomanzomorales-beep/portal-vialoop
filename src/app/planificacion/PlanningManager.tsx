"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  getScheduledTaskStatusLabel,
  scheduledTaskStatuses,
  type ScheduledTaskMetadata,
  type ScheduledTaskStatus,
} from "@/lib/scheduled-task";
import {
  completeTask,
  deleteTask,
  importTasks,
  saveTask,
  type TaskActionState,
} from "./actions";
import styles from "./planificacion.module.css";

export type ScheduledTaskRecord = {
  id: string;
  createdAt: string;
  metadata: ScheduledTaskMetadata;
};

type ClientOption = { id: string; name: string };
const initialState: TaskActionState = { ok: false, message: "" };

function date(value: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export default function PlanningManager({
  clients,
  tasks,
  today,
}: {
  clients: ClientOption[];
  tasks: ScheduledTaskRecord[];
  today: string;
}) {
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState(saveTask, initialState);
  const [importState, importAction, importPending] = useActionState(importTasks, initialState);
  const [editing, setEditing] = useState<ScheduledTaskRecord | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ScheduledTaskStatus>("ALL");
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TaskActionState | null>(null);
  const [transitioning, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tasks
      .filter((task) => status === "ALL" || task.metadata.status === status)
      .filter((task) =>
        !normalized
          ? true
          : `${task.metadata.title} ${task.metadata.clientName} ${task.metadata.responsible} ${task.metadata.notes}`
              .toLowerCase()
              .includes(normalized),
      )
      .toSorted((first, second) => first.metadata.dueDate.localeCompare(second.metadata.dueDate));
  }, [query, status, tasks]);

  const openEditor = (task: ScheduledTaskRecord | null) => {
    setEditing(task);
    setFormVersion((current) => current + 1);
    window.setTimeout(() => {
      document.getElementById("task-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  };

  const runAction = (id: string, action: () => Promise<TaskActionState>) => {
    setActionId(id);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        setFeedback(result);
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ ok: false, message: "No fue posible completar la operación." });
      } finally {
        setActionId(null);
      }
    });
  };

  return (
    <section className={styles.manager}>
      <div className={styles.managerHeader}>
        <div>
          <span className={styles.eyebrow}>Agenda operativa</span>
          <h2>Trabajos y tareas</h2>
          <p>Los plazos se incorporan automáticamente al calendario general de Seguimiento.</p>
        </div>
        <button className={styles.primaryButton} onClick={() => openEditor(null)} type="button">
          + Nuevo trabajo
        </button>
      </div>

      <div className={styles.workspace}>
        <form
          action={saveAction}
          className={styles.editor}
          id="task-editor"
          key={`${editing?.id ?? "new"}-${formVersion}`}
        >
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div className={styles.panelHeading}>
            <div>
              <span>Registro manual</span>
              <strong>{editing ? `Editar ${editing.metadata.title}` : "Programar trabajo"}</strong>
            </div>
            {editing ? (
              <button className={styles.textButton} onClick={() => openEditor(null)} type="button">Crear otro</button>
            ) : null}
          </div>
          <label className={styles.wideField}>
            <span>Trabajo o tarea *</span>
            <input defaultValue={editing?.metadata.title} name="title" required />
          </label>
          <label>
            <span>Cliente</span>
            <select defaultValue={editing?.metadata.clientId ?? ""} name="clientId">
              <option value="">Sin cliente asociado</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>
            <span>Responsable</span>
            <input defaultValue={editing?.metadata.responsible} name="responsible" placeholder="Doris, Roberto o equipo" />
          </label>
          <label>
            <span>Inicio</span>
            <input defaultValue={editing?.metadata.startDate ?? today} name="startDate" type="date" />
          </label>
          <label>
            <span>Fecha límite *</span>
            <input defaultValue={editing?.metadata.dueDate ?? today} name="dueDate" required type="date" />
          </label>
          <label>
            <span>Estado</span>
            <select defaultValue={editing?.metadata.status ?? "PENDING"} name="status">
              {scheduledTaskStatuses.map((item) => (
                <option key={item} value={item}>{getScheduledTaskStatusLabel(item)}</option>
              ))}
            </select>
          </label>
          <label className={styles.wideField}>
            <span>Detalle</span>
            <textarea defaultValue={editing?.metadata.notes} name="notes" rows={4} />
          </label>
          {saveState.message ? (
            <p className={saveState.ok ? styles.feedbackSuccess : styles.feedbackError}>{saveState.message}</p>
          ) : null}
          <button className={styles.primaryButton} disabled={savePending} type="submit">
            {savePending ? "Guardando..." : editing ? "Guardar cambios" : "Programar trabajo"}
          </button>
        </form>

        <form action={importAction} className={styles.importPanel}>
          <div className={styles.panelHeading}>
            <div>
              <span>Importación</span>
              <strong>Carta Gantt Excel</strong>
            </div>
          </div>
          <p>
            Admite XLSX, XLS o CSV. Reconoce columnas como Tarea, Inicio, Fin, Responsable, Cliente, Estado y Notas.
          </p>
          <label className={styles.fileField}>
            <span>Archivo máximo 5 MB</span>
            <input accept=".xlsx,.csv" name="file" required type="file" />
          </label>
          {importState.message ? (
            <p className={importState.ok ? styles.feedbackSuccess : styles.feedbackError}>{importState.message}</p>
          ) : null}
          <button className={styles.secondaryButton} disabled={importPending} type="submit">
            {importPending ? "Importando..." : "Importar planificación"}
          </button>
        </form>
      </div>

      <div className={styles.filters}>
        <input
          aria-label="Buscar trabajos"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar trabajo, cliente o responsable"
          type="search"
          value={query}
        />
        <select
          aria-label="Filtrar por estado"
          onChange={(event) => setStatus(event.target.value as typeof status)}
          value={status}
        >
          <option value="ALL">Todos los estados</option>
          {scheduledTaskStatuses.map((item) => (
            <option key={item} value={item}>{getScheduledTaskStatusLabel(item)}</option>
          ))}
        </select>
      </div>

      {feedback ? <p className={feedback.ok ? styles.feedbackSuccess : styles.feedbackError}>{feedback.message}</p> : null}

      <div className={styles.taskList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No hay trabajos para mostrar</strong>
            <span>Registra una tarea o importa una planificación.</span>
          </div>
        ) : filtered.map((task) => {
          const overdue = task.metadata.status !== "COMPLETED" && task.metadata.dueDate < today;
          const busy = transitioning && actionId === task.id;
          return (
            <article key={task.id}>
              <div className={styles.taskIdentity}>
                <span className={`${styles.status} ${styles[`status${task.metadata.status}`]}`}>
                  {getScheduledTaskStatusLabel(task.metadata.status)}
                </span>
                <strong>{task.metadata.title}</strong>
                <small>{task.metadata.clientName || "Sin cliente asociado"}</small>
              </div>
              <div className={styles.taskOwner}>
                <span>Responsable</span>
                <strong>{task.metadata.responsible || "Equipo"}</strong>
              </div>
              <div className={overdue ? styles.taskOverdue : styles.taskDate}>
                <span>Fecha límite</span>
                <strong>{date(task.metadata.dueDate)}</strong>
              </div>
              <div className={styles.taskActions}>
                {task.metadata.status !== "COMPLETED" ? (
                  <button disabled={busy} onClick={() => runAction(task.id, () => completeTask(task.id))} type="button">
                    Completar
                  </button>
                ) : null}
                <button onClick={() => openEditor(task)} type="button">Editar</button>
                <button
                  className={styles.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${task.metadata.title}?`)) {
                      runAction(task.id, () => deleteTask(task.id));
                    }
                  }}
                  type="button"
                >
                  Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
