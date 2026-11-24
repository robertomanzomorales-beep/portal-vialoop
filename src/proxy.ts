import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  SESSION_REFRESH_THRESHOLD_SECONDS,
  verifySessionToken,
} from "@/lib/session-token";

function isPublicRoute(
  pathname: string,
) {
  return (
    pathname === "/login" ||
    pathname ===
      "/api/cron/renovaciones" ||
    pathname ===
      "/api/cron/cotizaciones-seguimiento" ||
    pathname ===
      "/api/flow/confirmacion" ||
    pathname ===
      "/api/flow/retorno" ||
    pathname ===
      "/api/soporte/inbound" ||
    pathname ===
      "/pagos/resultado"
  );
}

function createNextResponse(
  request: NextRequest,
) {
  const requestHeaders =
    new Headers(
      request.headers,
    );

  requestHeaders.set(
    "x-portal-pathname",
    request.nextUrl.pathname,
  );

  return NextResponse.next({
    request: {
      headers:
        requestHeaders,
    },
  });
}

export function proxy(
  request: NextRequest,
) {
  const pathname =
    request.nextUrl.pathname;

  if (
    isPublicRoute(
      pathname,
    )
  ) {
    return createNextResponse(
      request,
    );
  }

  const token =
    request.cookies.get(
      SESSION_COOKIE_NAME,
    )?.value;

  const session =
    verifySessionToken(
      token,
    );

  if (!session) {
    if (
      pathname.startsWith(
        "/api/",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Autenticación requerida.",
        },
        {
          status: 401,
        },
      );
    }

    const loginUrl =
      new URL(
        "/login",
        request.url,
      );

    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );

    return NextResponse.redirect(
      loginUrl,
    );
  }

  const response = createNextResponse(
    request,
  );
  const now = Math.floor(
    Date.now() / 1000,
  );

  if (
    session.expiresAt - now <=
    SESSION_REFRESH_THRESHOLD_SECONDS
  ) {
    const refreshed = createSessionToken({
      userId: session.userId,
      role: session.role,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: refreshed.token,
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      maxAge:
        SESSION_DURATION_SECONDS,
      expires: new Date(
        refreshed.expiresAt * 1000,
      ),
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
