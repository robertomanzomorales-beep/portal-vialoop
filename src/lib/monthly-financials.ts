import "server-only";

import { parseExpenseMetadata } from "@/lib/expense";
import { prisma } from "@/lib/prisma";

export type MonthlyFinancialSummary = {
  period: string;
  manualSalesNet: number;
  hostingSalesNet: number;
  netSales: number;
  outputVat: number;
  grossSales: number;
  cashCollected: number;
  accountsReceivable: number;
  operatingExpenseNet: number;
  operatingExpenseVat: number;
  operatingExpenseGross: number;
  estimatedVatPayable: number;
  operatingResult: number;
  operatingMargin: number;
  collectionRate: number;
  expenseRatio: number;
  saleCount: number;
  averageTicket: number;
  paidExpenseCount: number;
};

type HostingPaymentCandidate = {
  description: string;
  notes: string | null;
  reference: string | null;
  subscription: {
    plan: {
      name: string;
      description: string | null;
    };
  } | null;
};

export function parseFinancialPeriod(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    return null;
  }

  return { year, month, period: `${year}-${String(month).padStart(2, "0")}` };
}

export function createFinancialDateOnly(
  year: number,
  month: number,
  day = 1,
) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function getFinancialMonthRange(year: number, month: number) {
  return {
    start: createFinancialDateOnly(year, month),
    end: createFinancialDateOnly(year, month + 1),
  };
}

export function grossFromNet(netAmount: number) {
  return netAmount + Math.round(netAmount * 0.19);
}

export function netFromGross(grossAmount: number) {
  return Math.round(grossAmount / 1.19);
}

export function isHostingPayment(
  payment: HostingPaymentCandidate,
  hostingRenewalIds: Set<string>,
) {
  const renewalMatch = /^renewal:(.+)$/i.exec(
    payment.reference?.trim() ?? "",
  );

  if (renewalMatch) {
    return hostingRenewalIds.has(renewalMatch[1]);
  }

  const searchableText = [
    payment.description,
    payment.notes,
    payment.subscription?.plan.name,
    payment.subscription?.plan.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(hosting|alojamiento web|servidor web)\b/.test(searchableText);
}

export async function getMonthlyFinancials(year: number, month: number) {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const range = getFinancialMonthRange(year, month);
  const startKey = range.start.toISOString().slice(0, 10);
  const endKey = range.end.toISOString().slice(0, 10);

  const [
    manualSales,
    cashSalePayments,
    paidServicePayments,
    hostingRenewals,
    expenseLogs,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
        saleDate: { gte: range.start, lt: range.end },
      },
      select: {
        id: true,
        netAmount: true,
        payments: { select: { amount: true } },
      },
    }),
    prisma.salePayment.findMany({
      where: {
        paidAt: { gte: range.start, lt: range.end },
        sale: { status: "ACTIVE" },
      },
      select: {
        amount: true,
        reference: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: range.start, lt: range.end },
      },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        description: true,
        notes: true,
        amount: true,
        paidAt: true,
        method: true,
        reference: true,
        client: {
          select: {
            businessName: true,
            tradeName: true,
          },
        },
        subscription: {
          select: {
            plan: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
      },
    }),
    prisma.renewal.findMany({
      where: { type: "HOSTING" },
      select: { id: true },
    }),
    prisma.activityLog.findMany({
      where: { entityType: "Expense" },
      select: { metadata: true },
      take: 1000,
    }),
  ]);

  const hostingRenewalIds = new Set(hostingRenewals.map(({ id }) => id));
  const synchronizedPaymentIds = new Set(
    cashSalePayments
      .map((payment) =>
        /^payment:(.+)$/.exec(
          payment.reference?.trim() ?? "",
        )?.[1],
      )
      .filter((id): id is string => Boolean(id)),
  );
  const hostingPayments = paidServicePayments.filter(
    (payment) =>
      !synchronizedPaymentIds.has(payment.id) &&
      isHostingPayment(payment, hostingRenewalIds),
  );

  const manualSalesNet = manualSales.reduce(
    (total, sale) => total + Number(sale.netAmount),
    0,
  );
  const hostingSalesNet = hostingPayments.reduce(
    (total, payment) => total + netFromGross(Number(payment.amount)),
    0,
  );
  const netSales = manualSalesNet + hostingSalesNet;
  const outputVat = Math.round(netSales * 0.19);
  const grossSales = netSales + outputVat;
  const accountsReceivable = manualSales.reduce((total, sale) => {
    const paid = sale.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    return total + Math.max(grossFromNet(Number(sale.netAmount)) - paid, 0);
  }, 0);
  const cashCollected =
    cashSalePayments.reduce((total, payment) => total + Number(payment.amount), 0) +
    hostingPayments.reduce((total, payment) => total + Number(payment.amount), 0);

  let operatingExpenseNet = 0;
  let operatingExpenseVat = 0;
  let operatingExpenseGross = 0;
  let paidExpenseCount = 0;

  for (const log of expenseLogs) {
    const expense = parseExpenseMetadata(log.metadata);
    if (!expense || expense.category !== "VIALOOP") continue;

    for (const payment of expense.payments) {
      if (payment.paidAt < startKey || payment.paidAt >= endKey) continue;

      const gross = Math.max(0, Math.round(payment.amount));
      const net =
        expense.taxTreatment === "TAXABLE" ? netFromGross(gross) : gross;
      const vat = expense.taxTreatment === "TAXABLE" ? gross - net : 0;

      operatingExpenseGross += gross;
      operatingExpenseNet += net;
      operatingExpenseVat += vat;
      paidExpenseCount += 1;
    }
  }

  const operatingResult = netSales - operatingExpenseNet;
  const saleCount = manualSales.length + hostingPayments.length;
  const summary: MonthlyFinancialSummary = {
    period,
    manualSalesNet,
    hostingSalesNet,
    netSales,
    outputVat,
    grossSales,
    cashCollected,
    accountsReceivable,
    operatingExpenseNet,
    operatingExpenseVat,
    operatingExpenseGross,
    estimatedVatPayable: outputVat - operatingExpenseVat,
    operatingResult,
    operatingMargin: netSales > 0 ? (operatingResult / netSales) * 100 : 0,
    collectionRate: grossSales > 0 ? (cashCollected / grossSales) * 100 : 0,
    expenseRatio: netSales > 0 ? (operatingExpenseNet / netSales) * 100 : 0,
    saleCount,
    averageTicket: saleCount > 0 ? netSales / saleCount : 0,
    paidExpenseCount,
  };

  return {
    summary,
    manualSales,
    hostingPayments,
    hostingRenewalIds: [...hostingRenewalIds],
  };
}

export function financialSummaryFingerprint(summary: MonthlyFinancialSummary) {
  return JSON.stringify({
    netSales: summary.netSales,
    outputVat: summary.outputVat,
    grossSales: summary.grossSales,
    cashCollected: summary.cashCollected,
    accountsReceivable: summary.accountsReceivable,
    operatingExpenseNet: summary.operatingExpenseNet,
    operatingExpenseVat: summary.operatingExpenseVat,
    estimatedVatPayable: summary.estimatedVatPayable,
    operatingResult: summary.operatingResult,
  });
}

export function parseClosedFinancialSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  const summary = metadata.summary;

  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const candidate = summary as Record<string, unknown>;
  const period = typeof candidate.period === "string" ? candidate.period : "";
  const numericKeys: Array<keyof Omit<MonthlyFinancialSummary, "period">> = [
    "manualSalesNet",
    "hostingSalesNet",
    "netSales",
    "outputVat",
    "grossSales",
    "cashCollected",
    "accountsReceivable",
    "operatingExpenseNet",
    "operatingExpenseVat",
    "operatingExpenseGross",
    "estimatedVatPayable",
    "operatingResult",
    "operatingMargin",
    "collectionRate",
    "expenseRatio",
    "saleCount",
    "averageTicket",
    "paidExpenseCount",
  ];

  if (!period || numericKeys.some((key) => !Number.isFinite(Number(candidate[key])))) {
    return null;
  }

  return numericKeys.reduce(
    (result, key) => ({ ...result, [key]: Number(candidate[key]) }),
    { period } as MonthlyFinancialSummary,
  );
}
