import { cookies } from "next/headers";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  type SessionRole,
  verifySessionToken,
} from "@/lib/session-token";

export async function createSession({
  userId,
  role,
}: {
  userId: string;
  role: SessionRole;
}) {
  const {
    token,
    expiresAt,
  } = createSessionToken({
    userId,
    role,
  });

  const cookieStore =
    await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge:
      SESSION_DURATION_SECONDS,
    expires: new Date(
      expiresAt * 1000,
    ),
  });
}

export async function getSession() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    )?.value;

  return verifySessionToken(token);
}

export async function deleteSession() {
  const cookieStore =
    await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}