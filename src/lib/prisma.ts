import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const pooledUrl = process.env.DATABASE_POOL_URL?.trim();

  if (pooledUrl) {
    if (!/^postgres(?:ql)?:\/\//i.test(pooledUrl)) {
      throw new Error("DATABASE_POOL_URL requiere una conexión PostgreSQL.");
    }

    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString: pooledUrl,
        connectionTimeoutMillis: 5_000,
        max: 5,
      }),
    });
  }

  const accelerateUrl = process.env.DATABASE_URL;

  if (!accelerateUrl) {
    throw new Error("Define DATABASE_POOL_URL o DATABASE_URL.");
  }

  return new PrismaClient({ accelerateUrl });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
