export const scheduledTaskStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "COMPLETED",
] as const;

export type ScheduledTaskStatus = (typeof scheduledTaskStatuses)[number];

export const clientOperationServiceTypes = [
  "WEB",
  "SOFTWARE",
  "HOSTING",
  "MARKETING",
  "AUDIOVISUAL",
  "OTHER",
] as const;

export type ClientOperationServiceType =
  (typeof clientOperationServiceTypes)[number];

export type ClientOperationWorkflow = {
  type: "CLIENT_ONBOARDING";
  id: string;
  serviceType: ClientOperationServiceType;
  serviceName: string;
  stepId: string;
  order: number;
  total: number;
  targetDate: string;
};

export type ScheduledTaskMetadata = {
  title: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  startDate: string;
  dueDate: string;
  status: ScheduledTaskStatus;
  responsible: string;
  notes: string;
  source: "MANUAL" | "EXCEL" | "WORKFLOW";
  workflow: ClientOperationWorkflow | null;
  updatedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isClientOperationServiceType(
  value: unknown,
): value is ClientOperationServiceType {
  return clientOperationServiceTypes.includes(
    value as ClientOperationServiceType,
  );
}

function parseWorkflow(value: unknown): ClientOperationWorkflow | null {
  if (!isObject(value) || value.type !== "CLIENT_ONBOARDING") {
    return null;
  }

  const id = stringValue(value.id).trim();
  const serviceName = stringValue(value.serviceName).trim();
  const stepId = stringValue(value.stepId).trim();
  const order = numberValue(value.order);
  const total = numberValue(value.total);

  if (
    !id ||
    !serviceName ||
    !stepId ||
    !isClientOperationServiceType(value.serviceType) ||
    order < 1 ||
    total < order
  ) {
    return null;
  }

  return {
    type: "CLIENT_ONBOARDING",
    id,
    serviceType: value.serviceType,
    serviceName,
    stepId,
    order,
    total,
    targetDate: stringValue(value.targetDate),
  };
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
    projectId: stringValue(value.projectId),
    projectName: stringValue(value.projectName),
    startDate: stringValue(value.startDate),
    dueDate,
    status: isScheduledTaskStatus(value.status) ? value.status : "PENDING",
    responsible: stringValue(value.responsible),
    notes: stringValue(value.notes),
    source:
      value.source === "EXCEL"
        ? "EXCEL"
        : value.source === "WORKFLOW"
          ? "WORKFLOW"
          : "MANUAL",
    workflow: parseWorkflow(value.workflow),
    updatedAt: stringValue(value.updatedAt),
  };
}

export function getScheduledTaskStatusLabel(status: ScheduledTaskStatus) {
  return {
    PENDING: "Pendiente",
    IN_PROGRESS: "En curso",
    WAITING_CLIENT: "Esperando al cliente",
    BLOCKED: "Bloqueada",
    COMPLETED: "Completada",
  }[status];
}

export function getClientOperationServiceTypeLabel(
  type: ClientOperationServiceType,
) {
  return {
    WEB: "Sitio web",
    SOFTWARE: "Software",
    HOSTING: "Hosting y correo",
    MARKETING: "Marketing digital",
    AUDIOVISUAL: "Producción audiovisual",
    OTHER: "Otro servicio",
  }[type];
}

export function isClientOperationTask(metadata: ScheduledTaskMetadata) {
  return metadata.source === "WORKFLOW" && metadata.workflow?.type === "CLIENT_ONBOARDING";
}
