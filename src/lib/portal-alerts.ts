import "server-only";

import { parseExpenseMetadata } from "@/lib/expense";
import { prisma } from "@/lib/prisma";

export type PortalAlert = {
  id: string;
  kind: "renewal" | "payment" | "expense";
  tone: "critical" | "warning" | "neutral";
  label: string;
  title: string;
  detail: string;
  dateLabel: string;
  href: string;
  dateKey: string;
};

export type PortalAlertSummary = {
  items: PortalAlert[];
  total: number;
  critical: number;
};

function chileDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(date);
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function deadline(dateKey: string, today: string) {
  const difference = Math.round(
    (new Date(`${dateKey}T12:00:00.000Z`).getTime() -
      new Date(`${today}T12:00:00.000Z`).getTime()) /
      86_400_000,
  );

  if (difference < 0) {
    return {
      tone: "critical" as const,
      label: `Vencido hace ${Math.abs(difference)} día${difference === -1 ? "" : "s"}`,
    };
  }

  if (difference === 0) {
    return { tone: "critical" as const, label: "Vence hoy" };
  }

  if (difference <= 7) {
    return {
      tone: "warning" as const,
      label: `Vence en ${difference} día${difference === 1 ? "" : "s"}`,
    };
  }

  return {
    tone: "neutral" as const,
    label: `Vence en ${difference} días`,
  };
}

export async function getPortalAlerts(): Promise<PortalAlertSummary> {
  const today = chileDateKey();
  const limit = addDays(today, 30);
  const limitDate = new Date(`${limit}T23:59:59.999Z`);

  const [renewals, hostingProjects, payments, expenseLogs] = await Promise.all([
    prisma.renewal.findMany({
      where: {
        status: { in: ["UPCOMING", "NOTIFIED", "EXPIRED"] },
        dueDate: { lte: limitDate },
        client: { status: "ACTIVE" },
        OR: [
          { projectId: null },
          {
            project: {
              status: { in: ["DEVELOPMENT", "ACTIVE", "MAINTENANCE"] },
            },
          },
        ],
      },
      orderBy: { dueDate: "asc" },
      take: 80,
      select: {
        id: true,
        projectId: true,
        type: true,
        description: true,
        dueDate: true,
        amount: true,
        client: { select: { businessName: true, tradeName: true } },
        project: { select: { domain: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        hostingRenewalDate: { not: null, lte: limitDate },
        status: { in: ["DEVELOPMENT", "ACTIVE", "MAINTENANCE"] },
        client: { status: "ACTIVE" },
      },
      orderBy: { hostingRenewalDate: "asc" },
      take: 80,
      select: {
        id: true,
        name: true,
        domain: true,
        hostingRenewalDate: true,
        client: {
          select: { id: true, businessName: true, tradeName: true },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { not: null, lte: limitDate },
        client: { status: "ACTIVE" },
        OR: [
          { reference: null },
          { NOT: { reference: { startsWith: "renewal:" } } },
        ],
      },
      orderBy: { dueDate: "asc" },
      take: 80,
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        client: { select: { businessName: true, tradeName: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { entityType: "Expense" },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, metadata: true },
    }),
  ]);

  const renewalAlerts: PortalAlert[] = renewals.map((renewal) => {
    const dateKey = renewal.dueDate.toISOString().slice(0, 10);
    const timing = deadline(dateKey, today);
    const clientName = renewal.client.tradeName || renewal.client.businessName;
    const reference =
      renewal.project?.domain || renewal.project?.name || renewal.description;

    return {
      id: `renewal-${renewal.id}`,
      kind: "renewal",
      tone: timing.tone,
      label: timing.label,
      title: `${clientName} · ${reference}`,
      detail: `${renewal.description}${renewal.amount === null ? "" : ` · ${formatCurrency(renewal.amount)}`}`,
      dateLabel: formatDate(dateKey),
      href: `/renovaciones#renewal-${renewal.id}`,
      dateKey,
    };
  });

  const openHostingProjectIds = new Set(
    renewals
      .filter((renewal) => renewal.type === "HOSTING" && renewal.projectId)
      .map((renewal) => renewal.projectId),
  );
  const hostingProjectAlerts: PortalAlert[] = hostingProjects.flatMap(
    (project) => {
      if (
        !project.hostingRenewalDate ||
        openHostingProjectIds.has(project.id)
      ) {
        return [];
      }

      const dateKey = project.hostingRenewalDate.toISOString().slice(0, 10);
      const timing = deadline(dateKey, today);
      const clientName = project.client.tradeName || project.client.businessName;

      return [{
        id: `hosting-project-${project.id}`,
        kind: "renewal" as const,
        tone: timing.tone,
        label: timing.label,
        title: `${clientName} · ${project.domain || project.name}`,
        detail: "Hosting con fecha técnica pendiente de regularizar",
        dateLabel: formatDate(dateKey),
        href: `/clientes/${project.client.id}?vista=servicios`,
        dateKey,
      }];
    },
  );

  const paymentAlerts: PortalAlert[] = payments.flatMap((payment) => {
    if (!payment.dueDate) return [];

    const dateKey = payment.dueDate.toISOString().slice(0, 10);
    const timing = deadline(dateKey, today);
    const clientName = payment.client.tradeName || payment.client.businessName;

    return [{
      id: `payment-${payment.id}`,
      kind: "payment" as const,
      tone: timing.tone,
      label: timing.label,
      title: `${clientName} · ${payment.description}`,
      detail: `Cobro pendiente · ${formatCurrency(payment.amount)}`,
      dateLabel: formatDate(dateKey),
      href: "/pagos",
      dateKey,
    }];
  });

  const expenseAlerts: PortalAlert[] = expenseLogs.flatMap((log) => {
    const expense = parseExpenseMetadata(log.metadata);

    if (
      !expense?.active ||
      expense.category !== "VIALOOP" ||
      !expense.nextDueDate ||
      expense.nextDueDate > limit
    ) {
      return [];
    }

    const timing = deadline(expense.nextDueDate, today);

    return [{
      id: `expense-${log.id}`,
      kind: "expense" as const,
      tone: timing.tone,
      label: timing.label,
      title: expense.concept,
      detail: `Pago Vialoop · ${formatCurrency(expense.amount)}`,
      dateLabel: formatDate(expense.nextDueDate),
      href: "/gastos",
      dateKey: expense.nextDueDate,
    }];
  });

  const items = [
    ...renewalAlerts,
    ...hostingProjectAlerts,
    ...paymentAlerts,
    ...expenseAlerts,
  ].sort(
    (first, second) => {
      const toneOrder = { critical: 0, warning: 1, neutral: 2 };
      return (
        toneOrder[first.tone] - toneOrder[second.tone] ||
        first.dateKey.localeCompare(second.dateKey)
      );
    },
  );

  return {
    items: items.slice(0, 10),
    total: items.length,
    critical: items.filter((item) => item.tone === "critical").length,
  };
}
