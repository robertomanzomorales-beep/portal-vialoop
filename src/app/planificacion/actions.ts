"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import {
  getScheduledTaskStatusLabel,
  isScheduledTaskStatus,
  parseScheduledTaskMetadata,
  type ScheduledTaskMetadata,
  type ScheduledTaskStatus,
} from "@/lib/scheduled-task";
import { prisma } from "@/lib/prisma";

export type TaskActionState = {
  ok: boolean;
  message: string;
  savedId?: string;
  deletedId?: string;
  imported?: number;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function text(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function saveTask(
  _previousState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const user = await requireUser();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const clientId = text(formData, "clientId");
  const projectId = text(formData, "projectId");
  const startDate = validDate(text(formData, "startDate"));
  const dueDate = validDate(text(formData, "dueDate"));
  const status = text(formData, "status");
  const responsible = text(formData, "responsible");
  const notes = text(formData, "notes");

  if (!title || !dueDate || !isScheduledTaskStatus(status)) {
    return {
      ok: false,
      message: "Indica el trabajo, su fecha límite y un estado válido.",
    };
  }

  const [client, project, existing] = await Promise.all([
    clientId
      ? prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true, businessName: true, tradeName: true },
        })
      : Promise.resolve(null),
    projectId
      ? prisma.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            name: true,
            domain: true,
            clientId: true,
            client: {
              select: { id: true, businessName: true, tradeName: true },
            },
          },
        })
      : Promise.resolve(null),
    id
      ? prisma.activityLog.findFirst({
          where: { id, entityType: "ScheduledTask" },
          select: { id: true, metadata: true },
        })
      : Promise.resolve(null),
  ]);

  if (clientId && !client) {
    return { ok: false, message: "El cliente seleccionado ya no existe." };
  }
  if (projectId && !project) {
    return { ok: false, message: "El proyecto seleccionado ya no existe." };
  }
  if (project && clientId && project.clientId !== clientId) {
    return {
      ok: false,
      message: "El proyecto no pertenece al cliente seleccionado.",
    };
  }
  if (id && !existing) {
    return { ok: false, message: "El trabajo ya no existe." };
  }

  const previous = existing ? parseScheduledTaskMetadata(existing.metadata) : null;
  const linkedClient = project?.client ?? client;
  const metadata: ScheduledTaskMetadata = {
    title,
    clientId: linkedClient?.id ?? "",
    clientName: linkedClient
      ? linkedClient.tradeName || linkedClient.businessName
      : "",
    projectId: project?.id ?? "",
    projectName: project ? project.domain || project.name : "",
    startDate,
    dueDate,
    status,
    responsible,
    notes,
    source: previous?.source ?? "MANUAL",
    workflow: previous?.workflow ?? null,
    updatedAt: new Date().toISOString(),
  };

  const saved = existing
    ? await prisma.activityLog.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          clientId: linkedClient?.id ?? null,
          projectId: project?.id ?? null,
          action: "SCHEDULED_TASK_UPDATED",
          entityId: title,
          description: `${title} actualizado.`,
          metadata: json(metadata),
        },
      })
    : await prisma.activityLog.create({
        data: {
          userId: user.id,
          clientId: linkedClient?.id,
          projectId: project?.id,
          action: "SCHEDULED_TASK_CREATED",
          entityType: "ScheduledTask",
          entityId: title,
          description: `${title} agregado a planificación.`,
          metadata: json(metadata),
        },
      });

  revalidatePath("/");
  revalidatePath("/planificacion");
  revalidatePath("/seguimiento");
  if (linkedClient?.id) {
    revalidatePath(`/clientes/${linkedClient.id}`);
  }

  return {
    ok: true,
    message: `${title} ${existing ? "actualizado" : "programado"} correctamente.`,
    savedId: saved.id,
  };
}

function parseImportedDate(
  value: unknown,
) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const milliseconds = Math.round((value - 25569) * 86_400_000);
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(raw);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function importedStatus(value: unknown): ScheduledTaskStatus {
  const normalized = normalize(typeof value === "string" ? value : "");
  if (normalized.includes("complet") || normalized.includes("termin")) return "COMPLETED";
  if (normalized.includes("esper") && normalized.includes("client")) return "WAITING_CLIENT";
  if (normalized.includes("bloque")) return "BLOCKED";
  if (normalized.includes("curso") || normalized.includes("proceso")) return "IN_PROGRESS";
  return "PENDING";
}

function rowValue(row: Record<string, unknown>, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalize));
  const entry = Object.entries(row).find(([key]) => aliasSet.has(normalize(key)));
  return entry?.[1];
}

async function readImportedRows(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === "csv") {
    const { parse } = await import("csv-parse/sync");
    return parse(buffer, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  }

  if (extension !== "xlsx") {
    throw new Error("Formato no compatible. Usa un archivo .xlsx o .csv.");
  }

  const { readSheet } = await import("read-excel-file/node");
  const sheet = await readSheet(buffer);

  if (sheet.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = sheet;
  const headers = headerRow.map((entry) => String(entry ?? "").trim());

  return dataRows.flatMap((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) {
        record[header] = row[index] ?? "";
      }
    });

    return Object.values(record).some((entry) => entry !== "" && entry !== null)
      ? [record]
      : [];
  });
}

export async function importTasks(
  _previousState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Selecciona un archivo Excel o CSV." };
  }
  if (file.size > 5_000_000) {
    return { ok: false, message: "El archivo supera el máximo de 5 MB." };
  }

  try {
    const rows = (await readImportedRows(file)).slice(0, 500);
    if (rows.length === 0) {
      return { ok: false, message: "El archivo no contiene filas legibles." };
    }
    const clients = await prisma.client.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, businessName: true, tradeName: true },
    });
    const clientMap = new Map<string, (typeof clients)[number]>();
    clients.forEach((client) => {
      clientMap.set(normalize(client.businessName), client);
      if (client.tradeName) clientMap.set(normalize(client.tradeName), client);
    });
    const now = new Date().toISOString();
    const unknownClients = new Set<string>();
    const parsed = rows.flatMap((row) => {
      const titleValue = rowValue(row, ["tarea", "trabajo", "titulo", "actividad", "nombre"]);
      const title = typeof titleValue === "string" ? titleValue.trim() : String(titleValue || "").trim();
      const dueDate = parseImportedDate(
        rowValue(row, ["fin", "fecha fin", "vencimiento", "fecha limite", "due date"]),
      );
      if (!title || !dueDate) return [];
      const startDate = parseImportedDate(
        rowValue(row, ["inicio", "fecha inicio", "start date"]),
      );
      const clientValue = rowValue(row, ["cliente", "empresa"]);
      const importedClientName = typeof clientValue === "string" ? clientValue.trim() : "";
      const client = importedClientName ? clientMap.get(normalize(importedClientName)) : undefined;
      if (importedClientName && !client) {
        unknownClients.add(importedClientName);
        return [];
      }
      const responsibleValue = rowValue(row, ["responsable", "encargado", "asignado"]);
      const notesValue = rowValue(row, ["notas", "descripcion", "detalle", "observaciones"]);
      const metadata: ScheduledTaskMetadata = {
        title,
        clientId: client?.id ?? "",
        clientName: client ? client.tradeName || client.businessName : "",
        projectId: "",
        projectName: "",
        startDate,
        dueDate,
        status: importedStatus(rowValue(row, ["estado", "status"])),
        responsible: typeof responsibleValue === "string" ? responsibleValue.trim() : "",
        notes: typeof notesValue === "string" ? notesValue.trim() : "",
        source: "EXCEL",
        workflow: null,
        updatedAt: now,
      };
      return [{ metadata, clientId: client?.id }];
    });

    if (unknownClients.size > 0) {
      return {
        ok: false,
        message: `No se importó el archivo. Primero registra o corrige estos clientes en la ficha maestra: ${[...unknownClients]
          .slice(0, 5)
          .join(", ")}${unknownClients.size > 5 ? "…" : ""}.`,
      };
    }

    if (parsed.length === 0) {
      return {
        ok: false,
        message: "No se encontraron filas con una tarea y fecha de fin. Usa columnas como Tarea, Inicio, Fin, Responsable y Cliente.",
      };
    }

    await prisma.$transaction(
      parsed.map(({ metadata, clientId }) =>
        prisma.activityLog.create({
          data: {
            userId: user.id,
            clientId,
            action: "SCHEDULED_TASK_IMPORTED",
            entityType: "ScheduledTask",
            entityId: metadata.title,
            description: `${metadata.title} importado desde ${file.name}.`,
            metadata: json(metadata),
          },
        }),
      ),
    );

    revalidatePath("/");
    revalidatePath("/planificacion");
    revalidatePath("/seguimiento");
    return {
      ok: true,
      message: `${parsed.length} trabajo${parsed.length === 1 ? "" : "s"} importado${parsed.length === 1 ? "" : "s"} correctamente.`,
      imported: parsed.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `No fue posible leer el archivo: ${error.message}` : "No fue posible leer el archivo.",
    };
  }
}

export async function setTaskStatus(
  id: string,
  status: ScheduledTaskStatus,
): Promise<TaskActionState> {
  const user = await requireUser();

  if (!isScheduledTaskStatus(status)) {
    return { ok: false, message: "El estado seleccionado no es válido." };
  }

  const existing = await prisma.activityLog.findFirst({
    where: { id, entityType: "ScheduledTask" },
    select: { id: true, clientId: true, metadata: true },
  });
  const task = existing ? parseScheduledTaskMetadata(existing.metadata) : null;
  if (!existing || !task) return { ok: false, message: "El trabajo ya no existe." };

  await prisma.activityLog.update({
    where: { id },
    data: {
      userId: user.id,
      action:
        status === "COMPLETED"
          ? "SCHEDULED_TASK_COMPLETED"
          : "SCHEDULED_TASK_STATUS_UPDATED",
      description: `${task.title} cambió a ${getScheduledTaskStatusLabel(status)}.`,
      metadata: json({ ...task, status, updatedAt: new Date().toISOString() }),
    },
  });

  if (
    status === "COMPLETED" &&
    task.workflow?.type === "CLIENT_ONBOARDING" &&
    existing.clientId
  ) {
    const workflow = task.workflow;
    const workflowLogs = await prisma.activityLog.findMany({
      where: {
        clientId: existing.clientId,
        entityType: "ScheduledTask",
      },
      select: { id: true, metadata: true },
      take: 250,
    });
    const workflowTasks = workflowLogs
      .flatMap((log) => {
        const metadata = parseScheduledTaskMetadata(log.metadata);
        return metadata ? [{ id: log.id, metadata }] : [];
      })
      .filter(
        (candidate) => candidate.metadata.workflow?.id === workflow.id,
      )
      .toSorted(
        (first, second) =>
          (first.metadata.workflow?.order ?? 0) -
          (second.metadata.workflow?.order ?? 0),
      );
    const firstOpenTask = workflowTasks.find(
      (candidate) => candidate.metadata.status !== "COMPLETED",
    );
    const nextTask =
      firstOpenTask?.metadata.status === "PENDING" ? firstOpenTask : null;

    if (nextTask) {
      await prisma.activityLog.update({
        where: { id: nextTask.id },
        data: {
          userId: user.id,
          action: "CLIENT_OPERATION_STEP_STARTED",
          description: `${nextTask.metadata.title} iniciado automáticamente.`,
          metadata: json({
            ...nextTask.metadata,
            status: "IN_PROGRESS",
            updatedAt: new Date().toISOString(),
          }),
        },
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/planificacion");
  revalidatePath("/seguimiento");
  if (existing.clientId) {
    revalidatePath(`/clientes/${existing.clientId}`);
  }

  return {
    ok: true,
    message: `${task.title}: estado actualizado correctamente.`,
    savedId: id,
  };
}

export async function completeTask(id: string): Promise<TaskActionState> {
  return setTaskStatus(id, "COMPLETED");
}

export async function deleteTask(id: string): Promise<TaskActionState> {
  await requireUser();
  const deleted = await prisma.activityLog.deleteMany({
    where: { id, entityType: "ScheduledTask" },
  });
  if (deleted.count !== 1) return { ok: false, message: "El trabajo ya no existe." };

  revalidatePath("/");
  revalidatePath("/planificacion");
  revalidatePath("/seguimiento");
  return { ok: true, message: "Trabajo eliminado correctamente.", deletedId: id };
}
