import { NextResponse } from "next/server";
import { processAutomaticRenewalEmails } from "@/lib/renewal-mailer";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  60;

function isAuthorized(
  request: Request,
) {
  const cronSecret =
    process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      "CRON_SECRET no está configurado.",
    );

    return false;
  }

  const authorization =
    request.headers.get(
      "authorization",
    );

  return (
    authorization ===
    `Bearer ${cronSecret}`
  );
}

export async function GET(
  request: Request,
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Solicitud no autorizada.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result =
      await processAutomaticRenewalEmails();

    return NextResponse.json(
      {
        ok: true,
        executedAt:
          new Date().toISOString(),
        result,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "Error general del cron de renovaciones:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        executedAt:
          new Date().toISOString(),
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