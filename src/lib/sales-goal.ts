import { prisma } from "@/lib/prisma";

export const DEFAULT_MONTHLY_SALES_GOAL =
  3_500_000;

export function getSalesGoalKey(
  year: number,
  month: number,
) {
  return `sales-goal:${year}-${String(
    month,
  ).padStart(2, "0")}`;
}

export async function getMonthlySalesGoal(
  year: number,
  month: number,
) {
  const counter =
    await prisma.counter.findUnique({
      where: {
        key: getSalesGoalKey(
          year,
          month,
        ),
      },
      select: {
        nextValue: true,
      },
    });

  return counter?.nextValue ??
    DEFAULT_MONTHLY_SALES_GOAL;
}
