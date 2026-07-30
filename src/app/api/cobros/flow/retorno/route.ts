import { NextResponse } from "next/server";
import { synchronizeSaleFlowPayment } from "@/lib/sale-flow-payment-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tokenFromRequest(request: Request) {
  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Flow no envió el token de retorno.");
  }

  return token.trim();
}

function publicState(
  state: "paid" | "pending" | "rejected" | "cancelled",
) {
  const states = {
    paid: "pagado",
    pending: "pendiente",
    rejected: "rechazado",
    cancelled: "anulado",
  };

  return states[state];
}

export async function POST(request: Request) {
  const resultUrl = new URL("/cobros/resultado", request.url);

  try {
    const token = await tokenFromRequest(request);
    const result = await synchronizeSaleFlowPayment(token);

    resultUrl.searchParams.set("estado", publicState(result.state));
    resultUrl.searchParams.set("orden", String(result.flowOrder));

    return NextResponse.redirect(resultUrl, 303);
  } catch (error) {
    console.error(
      "Error al procesar el retorno Flow de un cobro manual:",
      error,
    );
    resultUrl.searchParams.set("estado", "error");

    return NextResponse.redirect(resultUrl, 303);
  }
}
