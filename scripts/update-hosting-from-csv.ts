import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { parse } from "csv-parse/sync";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: path.resolve(process.cwd(), ".env"),
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    [
      "DATABASE_URL no está disponible.",
      `Directorio actual: ${process.cwd()}`,
      `Archivo .env esperado: ${path.resolve(process.cwd(), ".env")}`,
    ].join("\n"),
  );
}

const prisma = new PrismaClient({
  accelerateUrl: databaseUrl,
}).$extends(withAccelerate());

type CsvRow = {
  dominio: string;
  plan_contratado: string;
  proxima_renovacion: string;
  correo_cobro: string;
  estado_excel: string;
  valor_vialoop_neto: string;
  iva_vialoop: string;
  total_vialoop_con_iva: string;
  condicion_comercial: string;
  nota: string;
};

const APPLY_CHANGES = process.argv.includes("--apply");

const CSV_PATH = path.resolve(
  process.cwd(),
  "data/clientes_hosting_actualizados.csv",
);

function normalizeDomain(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function parseDateOnly(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Se encontró una fecha de renovación vacía.");
  }

  const date = new Date(`${normalized}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${value}`);
  }

  return date;
}

function parseClpAmount(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Monto inválido: ${value}`);
  }

  return Math.round(amount);
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today;
}

function getRenewalStatus(dueDate: Date) {
  return dueDate < getStartOfToday()
    ? ("EXPIRED" as const)
    : ("UPCOMING" as const);
}

function getPaymentStatus(dueDate: Date) {
  return dueDate < getStartOfToday()
    ? ("OVERDUE" as const)
    : ("PENDING" as const);
}

async function main() {
  console.log("\n=== ACTUALIZACIÓN DE HOSTING VIALOOP ===");
  console.log(
    `Modo: ${APPLY_CHANGES ? "APLICAR CAMBIOS" : "SIMULACIÓN"}`,
  );
  console.log(`Directorio: ${process.cwd()}`);
  console.log(`CSV: ${CSV_PATH}`);

  try {
    await fs.access(CSV_PATH);
  } catch {
    throw new Error(
      [
        "No se encontró el archivo CSV.",
        `Ruta esperada: ${CSV_PATH}`,
      ].join("\n"),
    );
  }

  const csvContent = await fs.readFile(CSV_PATH, "utf8");

  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[];

  if (rows.length === 0) {
    throw new Error("El CSV no contiene registros.");
  }

  const invalidRows = rows.filter(
    (row) =>
      !normalizeDomain(row.dominio) ||
      !row.proxima_renovacion?.trim() ||
      !row.total_vialoop_con_iva?.trim(),
  );

  if (invalidRows.length > 0) {
    throw new Error(
      `El CSV contiene ${invalidRows.length} filas sin dominio, fecha o monto total con IVA.`,
    );
  }

  const normalizedDomains = rows.map((row) =>
    normalizeDomain(row.dominio),
  );

  const duplicatedDomains = normalizedDomains.filter(
    (domain, index, domains) =>
      domains.indexOf(domain) !== index,
  );

  if (duplicatedDomains.length > 0) {
    throw new Error(
      `El CSV contiene dominios duplicados: ${[
        ...new Set(duplicatedDomains),
      ].join(", ")}`,
    );
  }

  const validDomains = new Set(normalizedDomains);

  const projects = await prisma.project.findMany({
    include: {
      client: true,
      renewals: {
        where: {
          type: "HOSTING",
        },
        orderBy: {
          dueDate: "desc",
        },
      },
    },
  });

  const projectByDomain = new Map(
    projects
      .filter((project) => Boolean(project.domain))
      .map((project) => [
        normalizeDomain(project.domain),
        project,
      ]),
  );

  const clients = await prisma.client.findMany({
    include: {
      projects: {
        include: {
          renewals: {
            where: {
              type: "HOSTING",
            },
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  /*
   * Se considera cliente de hosting inactivo cuando:
   * 1. Tiene al menos un proyecto con antecedentes de hosting.
   * 2. Ninguno de esos proyectos aparece en el nuevo maestro.
   *
   * Los clientes sin antecedentes de hosting no se eliminan.
   */
  const inactiveClients = clients.filter((client) => {
    const hostingProjects = client.projects.filter(
      (project) =>
        Boolean(project.hostingCapacity) ||
        Boolean(project.hostingProvider) ||
        Boolean(project.hostingRenewalDate) ||
        project.renewals.length > 0,
    );

    if (hostingProjects.length === 0) {
      return false;
    }

    return hostingProjects.every((project) => {
      const domain = normalizeDomain(project.domain);

      return !domain || !validDomains.has(domain);
    });
  });

  const missingDomains: string[] = [];

  let matchedDomains = 0;
  let updatedProjects = 0;
  let updatedRenewals = 0;
  let createdRenewals = 0;
  let updatedPayments = 0;
  let deletedClients = 0;

  console.log(`\nFilas válidas en CSV: ${rows.length}`);
  console.log(`Proyectos existentes: ${projects.length}`);
  console.log(
    `Clientes de hosting inactivos detectados: ${inactiveClients.length}`,
  );

  console.log("\n=== REGISTROS DEL MAESTRO ===");

  for (const row of rows) {
    const domain = normalizeDomain(row.dominio);
    const project = projectByDomain.get(domain);

    if (!project) {
      missingDomains.push(domain);
      console.warn(`NO ENCONTRADO: ${domain}`);
      continue;
    }

    matchedDomains += 1;

    const dueDate = parseDateOnly(row.proxima_renovacion);
    const amountWithVat = parseClpAmount(
      row.total_vialoop_con_iva,
    );
    const renewalStatus = getRenewalStatus(dueDate);
    const currentRenewal = project.renewals[0] ?? null;

    const notes = [
      row.estado_excel
        ? `Estado informado en Excel: ${row.estado_excel}.`
        : null,
      row.condicion_comercial
        ? `Condición comercial: ${row.condicion_comercial}.`
        : null,
      row.valor_vialoop_neto
        ? `Valor neto informado: ${row.valor_vialoop_neto}.`
        : null,
      row.iva_vialoop
        ? `IVA informado: ${row.iva_vialoop}.`
        : null,
      row.nota || null,
    ]
      .filter(Boolean)
      .join("\n");

    console.log(
      [
        domain,
        row.plan_contratado,
        row.proxima_renovacion,
        `$${amountWithVat.toLocaleString("es-CL")} IVA incluido`,
        renewalStatus,
      ].join(" | "),
    );

    if (!APPLY_CHANGES) {
      continue;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.client.update({
        where: {
          id: project.clientId,
        },
        data: {
          email:
            row.correo_cobro.trim() ||
            project.client.email,
          status: "ACTIVE",
        },
      });

      await transaction.project.update({
        where: {
          id: project.id,
        },
        data: {
          domain,
          websiteUrl:
            project.websiteUrl || `https://${domain}`,
          hostingCapacity:
            row.plan_contratado.trim() ||
            project.hostingCapacity,
          hostingRenewalDate: dueDate,
          status: "ACTIVE",
        },
      });

      updatedProjects += 1;

      let renewalId: string;

      if (currentRenewal) {
        const updatedRenewal =
          await transaction.renewal.update({
            where: {
              id: currentRenewal.id,
            },
            data: {
              clientId: project.clientId,
              projectId: project.id,
              type: "HOSTING",
              description:
                `Renovación de hosting ${row.plan_contratado} · ${domain}`,
              dueDate,
              amount: amountWithVat,
              status: renewalStatus,
              notifiedAt: null,
              renewedAt: null,
              notes,
            },
          });

        renewalId = updatedRenewal.id;
        updatedRenewals += 1;
      } else {
        const createdRenewal =
          await transaction.renewal.create({
            data: {
              clientId: project.clientId,
              projectId: project.id,
              type: "HOSTING",
              description:
                `Renovación de hosting ${row.plan_contratado} · ${domain}`,
              dueDate,
              amount: amountWithVat,
              status: renewalStatus,
              notes,
            },
          });

        renewalId = createdRenewal.id;
        createdRenewals += 1;
      }

      const internalPayment =
        await transaction.payment.findFirst({
          where: {
            clientId: project.clientId,
            reference: `renewal:${renewalId}`,
            status: {
              in: ["PENDING", "OVERDUE"],
            },
          },
        });

      if (internalPayment) {
        await transaction.payment.update({
          where: {
            id: internalPayment.id,
          },
          data: {
            description:
              `Renovación de hosting ${row.plan_contratado} · ${domain}`,
            amount: amountWithVat,
            dueDate,
            status: getPaymentStatus(dueDate),
            notes: [
              "Cobro interno actualizado desde el maestro corregido.",
              notes,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });

        updatedPayments += 1;
      }
    });
  }

  if (missingDomains.length > 0) {
    console.warn(
      "\n=== DOMINIOS DEL EXCEL NO ENCONTRADOS ===",
    );

    for (const domain of missingDomains) {
      console.warn(`- ${domain}`);
    }
  }

  if (inactiveClients.length > 0) {
    console.log(
      APPLY_CHANGES
        ? "\n=== ELIMINANDO CLIENTES DE HOSTING INACTIVOS ==="
        : "\n=== CLIENTES QUE SE ELIMINARÍAN AL APLICAR ===",
    );

    for (const client of inactiveClients) {
      const domains = client.projects
        .map((project) =>
          normalizeDomain(project.domain),
        )
        .filter(Boolean)
        .join(", ");

      console.log(
        `- ${client.businessName} (${domains || "sin dominio"})`,
      );

      if (APPLY_CHANGES) {
        await prisma.client.delete({
          where: {
            id: client.id,
          },
        });

        deletedClients += 1;
      }
    }
  }

  console.log("\n=== RESUMEN ===");
  console.log(`Filas del CSV: ${rows.length}`);
  console.log(`Dominios encontrados: ${matchedDomains}`);
  console.log(
    `Dominios no encontrados: ${missingDomains.length}`,
  );
  console.log(
    `Clientes inactivos detectados: ${inactiveClients.length}`,
  );
  console.log(
    `Clientes inactivos eliminados: ${deletedClients}`,
  );
  console.log(
    `Proyectos actualizados: ${updatedProjects}`,
  );
  console.log(
    `Renovaciones actualizadas: ${updatedRenewals}`,
  );
  console.log(
    `Renovaciones creadas: ${createdRenewals}`,
  );
  console.log(
    `Cobros internos actualizados: ${updatedPayments}`,
  );

  if (!APPLY_CHANGES) {
    console.log(
      [
        "",
        "SIMULACIÓN COMPLETADA.",
        "No se modificó ni eliminó ningún registro.",
        "Revisa los dominios no encontrados y los clientes que se eliminarían.",
        "Después ejecuta nuevamente con --apply.",
      ].join("\n"),
    );
  } else {
    console.log(
      [
        "",
        "ACTUALIZACIÓN COMPLETADA.",
        "Los datos del maestro fueron actualizados.",
        "Los clientes de hosting ausentes del maestro fueron eliminados.",
      ].join("\n"),
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nERROR DURANTE LA ACTUALIZACIÓN:",
    );

    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });