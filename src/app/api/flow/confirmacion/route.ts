import {
  NextResponse,
} from "next/server";

import {
  synchronizeFlowPayment,
} from "@/lib/flow-payment-processor";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  15;

async function getToken(
  request: Request,
) {
  const formData =
    await request.formData();

  const token =
    formData.get(
      "token",
    );

  if (
    typeof token !==
      "string" ||
    !token.trim()
  ) {
    throw new Error(
      "Flow no envió el token de confirmación.",
    );
  }

  return token.trim();
}

export async function POST(
  request: Request,
) {
  try {
    const token =
      await getToken(
        request,
      );

    const result =
      await synchronizeFlowPayment(
        token,
      );

    console.info(
      "Confirmación Flow procesada:",
      result,
    );

    return new NextResponse(
      "OK",
      {
        status: 200,

        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",
        },
      },
    );
  } catch (error) {
    console.error(
      "Error al procesar la confirmación de Flow:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Error desconocido.",
      },
      {
        status: 500,
      },
    );
  }
}