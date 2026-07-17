import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient, RenewalStatus } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("La variable DATABASE_URL no está configurada.");
}

const prisma = new PrismaClient({
  accelerateUrl: databaseUrl,
}).$extends(withAccelerate());

type HostingRow = {
  nombreTemporal: string;
  razonSocial: string;
  rut: string;
  dominio: string;
  tipoServicio: string;
  capacidadGB: string;
  fechaRenovacion: string;
  correoCobro: string;
  contacto: string;
  ciudad: string;
  observaciones: string;
  valorPagar: string;
  estadoRegistro: string;
  vigencia: string;
};

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getRenewalStatus(date: Date | null): RenewalStatus {
  if (!date) {
    return RenewalStatus.UPCOMING;
  }

  return date < new Date()
    ? RenewalStatus.EXPIRED
    : RenewalStatus.UPCOMING;
}

async function main() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "clientes_hosting_importacion.csv",
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el archivo: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");

  const rows = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as HostingRow[];

  let createdClients = 0;
  let updatedClients = 0;
  let createdProjects = 0;
  let updatedProjects = 0;
  let createdRenewals = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const domain = row.dominio.trim().toLowerCase();

    if (!domain) {
      skippedRows += 1;
      console.warn("Registro omitido porque no tiene dominio.");
      continue;
    }

    const businessName =
      optionalText(row.razonSocial) ??
      optionalText(row.nombreTemporal) ??
      domain;

    const existingProject = await prisma.project.findFirst({
      where: {
        domain,
      },
      include: {
        client: true,
      },
    });

    let client;

    if (existingProject) {
      client = await prisma.client.update({
        where: {
          id: existingProject.clientId,
        },
        data: {
          businessName,
          rut: optionalText(row.rut),
          mainContactName: optionalText(row.contacto),
          email:
            row.correoCobro.includes("@")
              ? optionalText(row.correoCobro)
              : null,
          city: optionalText(row.ciudad),
          internalNotes: optionalText(row.observaciones),
          status: "ACTIVE",
        },
      });

      updatedClients += 1;
    } else {
      client = await prisma.client.create({
        data: {
          businessName,
          rut: optionalText(row.rut),
          mainContactName: optionalText(row.contacto),
          email:
            row.correoCobro.includes("@")
              ? optionalText(row.correoCobro)
              : null,
          city: optionalText(row.ciudad),
          internalNotes: optionalText(row.observaciones),
          status: "ACTIVE",
        },
      });

      createdClients += 1;
    }

    const hostingCapacity = row.capacidadGB
      ? `${row.capacidadGB} GB`
      : null;

    const renewalDate = parseDate(row.fechaRenovacion);

    let project;

    if (existingProject) {
      project = await prisma.project.update({
        where: {
          id: existingProject.id,
        },
        data: {
          clientId: client.id,
          name: domain,
          domain,
          websiteUrl: `https://${domain}`,
          websiteType: "Sitio web con hosting",
          hostingProvider: "Vialoop / BenzaHosting",
          hostingCapacity,
          hostingRenewalDate: renewalDate,
          status: "ACTIVE",
          notes: optionalText(row.observaciones),
        },
      });

      updatedProjects += 1;
    } else {
      project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: domain,
          domain,
          websiteUrl: `https://${domain}`,
          websiteType: "Sitio web con hosting",
          hostingProvider: "Vialoop / BenzaHosting",
          hostingCapacity,
          hostingRenewalDate: renewalDate,
          status: "ACTIVE",
          notes: optionalText(row.observaciones),
        },
      });

      createdProjects += 1;
    }

    if (renewalDate) {
      const existingRenewal = await prisma.renewal.findFirst({
        where: {
          projectId: project.id,
          type: "HOSTING",
          dueDate: renewalDate,
        },
      });

      if (!existingRenewal) {
        await prisma.renewal.create({
          data: {
            clientId: client.id,
            projectId: project.id,
            type: "HOSTING",
            description: `Renovación ${row.tipoServicio || "hosting"}`,
            dueDate: renewalDate,
            amount: parseMoney(row.valorPagar),
            status: getRenewalStatus(renewalDate),
            notes: [
              optionalText(row.observaciones),
              row.estadoRegistro
                ? `Estado de importación: ${row.estadoRegistro}`
                : null,
              row.vigencia
                ? `Vigencia según planilla: ${row.vigencia}`
                : null,
            ]
              .filter(Boolean)
              .join(" | ") || null,
          },
        });

        createdRenewals += 1;
      }
    }

    console.log(`Procesado: ${domain}`);
  }

  console.log("");
  console.log("Importación terminada.");
  console.log(`Clientes creados: ${createdClients}`);
  console.log(`Clientes actualizados: ${updatedClients}`);
  console.log(`Proyectos creados: ${createdProjects}`);
  console.log(`Proyectos actualizados: ${updatedProjects}`);
  console.log(`Renovaciones creadas: ${createdRenewals}`);
  console.log(`Registros omitidos: ${skippedRows}`);
}

main()
  .catch((error) => {
    console.error("Error durante la importación:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });