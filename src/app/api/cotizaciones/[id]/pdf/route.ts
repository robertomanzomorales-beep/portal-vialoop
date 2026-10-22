import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createQuotationPdf,
  parseQuotationMetadata,
} from "@/lib/quotation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      { error: "Sesión requerida" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const log = await prisma.activityLog.findFirst({
    where: {
      id,
      entityType: "Quotation",
    },
    select: {
      metadata: true,
    },
  });

  const quotation = parseQuotationMetadata(
    log?.metadata,
  );

  if (!quotation) {
    return Response.json(
      { error: "Cotización no encontrada" },
      { status: 404 },
    );
  }

  const pdf = await createQuotationPdf(
    quotation,
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${quotation.number}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
