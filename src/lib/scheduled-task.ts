export const scheduledTaskStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
] as const;

export type ScheduledTaskStatus = (typeof scheduledTaskStatuses)[number];

export type ScheduledTaskMetadata = {
  title: string;
  clientId: string;
  clientName: string;
  startDate: string;
  dueDate: string;
  status: ScheduledTaskStatus;
  responsible: string;
  notes: string;
  source: "MANUAL" | "EXCEL";
  updatedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isScheduledTaskStatus(value: unknown): value is ScheduledTaskStatus {
  return scheduledTaskStatuses.includes(value as ScheduledTaskStatus);
}

export function parseScheduledTaskMetadata(value: unknown): ScheduledTaskMetadata | null {
  if (!isObject(value)) return null;
  const title = stringValue(value.title).trim();
  const dueDate = stringValue(value.dueDate);

  if (!title || !dueDate) return null;

  return {
    title,
    clientId: stringValue(value.clientId),
    clientName: stringValue(value.clientName),
    startDate: stringValue(value.startDate),
    dueDate,
    status: isScheduledTaskStatus(value.status) ? value.status : "PENDING",
    responsible: stringValue(value.responsible),
    notes: stringValue(value.notes),
    source: value.source === "EXCEL" ? "EXCEL" : "MANUAL",
    updatedAt: stringValue(value.updatedAt),
  };
}

export function getScheduledTaskStatusLabel(status: ScheduledTaskStatus) {
  return {
    PENDING: "Pendiente",
    IN_PROGRESS: "En curso",
    BLOCKED: "Bloqueada",
    COMPLETED: "Completada",
  }[status];
}
