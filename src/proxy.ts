import {
  NextResponse,
  type NextRequest,
} from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session-token";

function isPublicRoute(
  pathname: string,
) {
  return pathname === "/login";
}

function createNextResponse(
  request: NextRequest,
) {
  const requestHeaders =
    new Headers(request.headers);

  requestHeaders.set(
    "x-portal-pathname",
    request.nextUrl.pathname,
  );

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export function proxy(
  request: NextRequest,
) {
  const pathname =
    request.nextUrl.pathname;

  const token =
    request.cookies.get(
      SESSION_COOKIE_NAME,
    )?.value;

  const session =
    verifySessionToken(token);

  if (
    !isPublicRoute(pathname) &&
    !session
  ) {
    if (
      pathname.startsWith("/api/")
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

  return createNextResponse(
    request,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};