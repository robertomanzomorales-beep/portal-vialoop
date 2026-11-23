import {
  getClientOperationServiceTypeLabel,
  type ClientOperationServiceType,
  type ScheduledTaskMetadata,
} from "@/lib/scheduled-task";

export type ClientOperationTaskRecord = {
  id: string;
  createdAt: string;
  metadata: ScheduledTaskMetadata;
};

type BuildClientOperationTasksInput = {
  workflowId: string;
  clientId: string;
  clientName: string;
  serviceType: ClientOperationServiceType;
  serviceName: string;
  responsible: string;
  startDate: string;
  targetDate: string;
  updatedAt: string;
};

const steps = [
  {
    id: "CLIENT_CREATED",
    title: "Alta comercial registrada",
    progress: 0,
    notes:
      "Ficha maestra creada con la empresa, contacto principal y contexto comercial.",
  },
  {
    id: "TERMS_AND_PAYMENT",
    title: "Confirmar alcance y pago inicial",
    progress: 0.1,
    notes:
      "Verificar servicio contratado, condiciones comerciales, forma de pago y abono de inicio cuando corresponda.",
  },
  {
    id: "WELCOME_EMAIL",
    title: "Enviar bienvenida y requisitos",
    progress: 0.17,
    notes:
      "Enviar el correo editable de Doris con materiales, archivos, accesos y próximos pasos.",
  },
  {
    id: "INPUTS_RECEIVED",
    title: "Recibir materiales y accesos",
    progress: 0.32,
    notes:
      "Confirmar que el material recibido está completo, utilizable y almacenado de forma ordenada.",
  },
  {
    id: "IMPLEMENTATION_PLAN",
    title: "Planificar implementación",
    progress: 0.42,
    notes:
      "Definir responsable, actividades, dependencias, fechas de revisión y fecha objetivo de entrega.",
  },
  {
    id: "IMPLEMENTATION",
    title: "Ejecutar implementación",
    progress: 0.75,
    notes:
      "Desarrollar el servicio contratado conforme al alcance y registrar cualquier cambio que afecte plazo o costo.",
  },
  {
    id: "CLIENT_REVIEW",
    title: "Revisión y aprobación del cliente",
    progress: 0.92,
    notes:
      "Entregar una versión revisable, concentrar observaciones y obtener aprobación antes del cierre.",
  },
  {
    id: "HANDOFF_AND_CONTINUITY",
    title: "Entrega y continuidad",
    progress: 1,
    notes:
      "Formalizar entrega, accesos, respaldos, soporte, facturación y próximas renovaciones aplicables.",
  },
] as const;

function dateValue(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).getTime();
}

function interpolatedDate(startDate: string, targetDate: string, progress: number) {
  const start = dateValue(startDate);
  const requestedTarget = dateValue(targetDate);
  const fallbackTarget = start + 30 * 86_400_000;
  const target = Number.isFinite(requestedTarget) && requestedTarget >= start
    ? requestedTarget
    : fallbackTarget;
  const value = start + Math.round((target - start) * progress);

  return new Date(value).toISOString().slice(0, 10);
}

export function buildClientOperationTasks(
  input: BuildClientOperationTasksInput,
): ScheduledTaskMetadata[] {
  return steps.map((step, index) => ({
    title:
      step.id === "IMPLEMENTATION"
        ? `Implementar ${input.serviceName}`
        : step.title,
    clientId: input.clientId,
    clientName: input.clientName,
    projectId: "",
    projectName: "",
    startDate: input.startDate,
    dueDate: interpolatedDate(
      input.startDate,
      input.targetDate,
      step.progress,
    ),
    status:
      index === 0
        ? "COMPLETED"
        : index === 1
          ? "IN_PROGRESS"
          : "PENDING",
    responsible: input.responsible,
    notes: `${step.notes} Servicio: ${input.serviceName}.`,
    source: "WORKFLOW",
    workflow: {
      type: "CLIENT_ONBOARDING",
      id: input.workflowId,
      serviceType: input.serviceType,
      serviceName: input.serviceName,
      stepId: step.id,
      order: index + 1,
      total: steps.length,
      targetDate: input.targetDate,
    },
    updatedAt: input.updatedAt,
  }));
}

export function getLatestClientOperationTasks(
  records: ClientOperationTaskRecord[],
) {
  const workflowDates = new Map<string, string>();

  for (const record of records) {
    const workflowId = record.metadata.workflow?.id;
    if (!workflowId) continue;
    const current = workflowDates.get(workflowId);
    if (!current || record.createdAt > current) {
      workflowDates.set(workflowId, record.createdAt);
    }
  }

  const latestWorkflowId = [...workflowDates.entries()].toSorted(
    (first, second) => second[1].localeCompare(first[1]),
  )[0]?.[0];

  if (!latestWorkflowId) {
    return [];
  }

  return records
    .filter((record) => record.metadata.workflow?.id === latestWorkflowId)
    .toSorted(
      (first, second) =>
        (first.metadata.workflow?.order ?? 0) -
        (second.metadata.workflow?.order ?? 0),
    );
}

export function getClientOperationSummary(
  records: ClientOperationTaskRecord[],
  today: string,
) {
  const completed = records.filter(
    (record) => record.metadata.status === "COMPLETED",
  ).length;
  const blocked = records.filter(
    (record) => record.metadata.status === "BLOCKED",
  ).length;
  const waitingClient = records.filter(
    (record) => record.metadata.status === "WAITING_CLIENT",
  ).length;
  const overdue = records.filter(
    (record) =>
      record.metadata.status !== "COMPLETED" &&
      record.metadata.dueDate < today,
  ).length;
  const current = records.find(
    (record) => record.metadata.status !== "COMPLETED",
  );
  const workflow = records[0]?.metadata.workflow;

  return {
    completed,
    total: records.length,
    progress:
      records.length > 0 ? Math.round((completed / records.length) * 100) : 0,
    blocked,
    waitingClient,
    overdue,
    currentTitle: current?.metadata.title ?? "Flujo completado",
    responsible: current?.metadata.responsible || records[0]?.metadata.responsible || "Equipo",
    targetDate: workflow?.targetDate ?? "",
    serviceName: workflow?.serviceName ?? "Servicio sin definir",
    serviceType: workflow
      ? getClientOperationServiceTypeLabel(workflow.serviceType)
      : "Servicio",
    finished: records.length > 0 && completed === records.length,
  };
}

