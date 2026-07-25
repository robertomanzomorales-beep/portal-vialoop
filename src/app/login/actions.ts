"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  deleteSession,
} from "@/lib/session";
import {
  getCurrentUser,
} from "@/lib/auth";
import {
  verifyPassword,
} from "@/lib/password";

function getString(
  formData: FormData,
  field: string,
) {
  const value =
    formData.get(field);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeEmail(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
}

function getSafeNextPath(
  value: string,
) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login")
  ) {
    return "/";
  }

  return value;
}

function getLoginErrorUrl({
  error,
  next,
}: {
  error: string;
  next: string;
}) {
  const searchParams =
    new URLSearchParams({
      error,
    });

  if (next !== "/") {
    searchParams.set(
      "next",
      next,
    );
  }

  return `/login?${searchParams.toString()}`;
}

async function waitBeforeFailure() {
  await new Promise((resolve) => {
    setTimeout(resolve, 650);
  });
}

export async function login(
  formData: FormData,
) {
  const email = normalizeEmail(
    getString(
      formData,
      "email",
    ),
  );

  const password = getString(
    formData,
    "password",
  );

  const next = getSafeNextPath(
    getString(
      formData,
      "next",
    ) || "/",
  );

  if (!email || !password) {
    redirect(
      getLoginErrorUrl({
        error: "campos",
        next,
      }),
    );
  }

  const user =
    await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
        role: {
          in: [
            "ADMIN",
            "COLLABORATOR",
          ],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        passwordHash: true,
      },
    });

  const passwordIsValid =
    user?.passwordHash
      ? await verifyPassword(
          password,
          user.passwordHash,
        )
      : false;

  if (
    !user ||
    !user.active ||
    (
      user.role !== "ADMIN" &&
      user.role !==
        "COLLABORATOR"
    ) ||
    !passwordIsValid
  ) {
    await waitBeforeFailure();

    redirect(
      getLoginErrorUrl({
        error: "credenciales",
        next,
      }),
    );
  }

  await createSession({
    userId: user.id,
    role: user.role,
  });

  try {
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "USER_LOGIN",
        entityType: "User",
        entityId: user.id,
        description: `${user.name} inició sesión en el Portal Vialoop.`,
        metadata: {
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch {
    // El inicio de sesión no se bloquea
    // si el historial falla.
  }

  redirect(next);
}

export async function logout() {
  const user =
    await getCurrentUser();

  if (user) {
    try {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "USER_LOGOUT",
          entityType: "User",
          entityId: user.id,
          description: `${user.name} cerró sesión en el Portal Vialoop.`,
          metadata: {
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch {
      // El cierre de sesión continúa.
    }
  }

  await deleteSession();

  redirect(
    "/login?resultado=sesion-cerrada",
  );
}