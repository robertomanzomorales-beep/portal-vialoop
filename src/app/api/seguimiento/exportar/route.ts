import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getProspectStatusLabel,
  parseProspectMetadata,
} from "@/lib/prospect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      { error: "Sesión requerida" },
      { status: 401 },
    );
  }

  const logs =
    await prisma.activityLog.findMany({
      where: {
        entityType: "Prospect",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5000,
    });

  const rows = logs.flatMap((log) => {
    const prospect =
      parseProspectMetadata(
        log.metadata,
      );

    if (!prospect) {
      return [];
    }

    return [
      [
        prospect.company,
        prospect.contactName,
        prospect.email,
        prospect.phone,
        prospect.industry,
        prospect.source,
        getProspectStatusLabel(
          prospect.status,
        ),
        prospect.interest,
        prospect.nextFollowUp,
        prospect.assignedTo,
        prospect.notes,
        log.createdAt
          .toISOString()
          .slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    ];
  });

  const header = [
    "Empresa",
    "Contacto",
    "Correo",
    "Teléfono",
    "Industria",
    "Origen",
    "Estado",
    "Interés",
    "Próximo seguimiento",
    "Responsable",
    "Notas",
    "Fecha de creación",
  ]
    .map(csvCell)
    .join(",");

  const body = `\uFEFF${[
    header,
    ...rows,
  ].join("\r\n")}`;

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition":
        'attachment; filename="seguimiento-vialoop.csv"',
      "Content-Type":
        "text/csv; charset=utf-8",
    },
  });
}
