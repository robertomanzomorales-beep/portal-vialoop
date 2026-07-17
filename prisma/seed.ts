import "dotenv/config";
import { PrismaClient, PlanType } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("La variable DATABASE_URL no está configurada.");
}

const prisma = new PrismaClient({
  accelerateUrl: databaseUrl,
}).$extends(withAccelerate());

async function main() {
  const plans = [
    {
      name: "Plan Esencial",
      type: PlanType.ESSENTIAL,
      monthlyPrice: 19990,
      includedRequests: 0,
      responseHours: 48,
      description:
        "Hosting, respaldo, monitoreo, portal del cliente, tickets de soporte, renovación administrada e informe básico.",
    },
    {
      name: "Plan Gestión",
      type: PlanType.MANAGEMENT,
      monthlyPrice: 34990,
      includedRequests: 2,
      responseHours: 48,
      description:
        "Incluye hasta 2 solicitudes menores al mes, cambios de contenido, soporte prioritario y analítica básica.",
    },
    {
      name: "Plan Activo",
      type: PlanType.ACTIVE,
      monthlyPrice: 59990,
      includedRequests: 4,
      responseHours: 24,
      description:
        "Incluye hasta 4 solicitudes mensuales, actualizaciones frecuentes, optimización básica y atención preferente.",
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: {
        type: plan.type,
      },
      update: plan,
      create: plan,
    });
  }

  console.log("Planes iniciales creados correctamente.");
}

main()
  .catch((error) => {
    console.error("Error al cargar los planes:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });