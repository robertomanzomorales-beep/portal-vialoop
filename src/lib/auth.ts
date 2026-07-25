import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role:
    | "ADMIN"
    | "COLLABORATOR";
};

export const getCurrentUser =
  cache(
    async (): Promise<
      CurrentUser | null
    > => {
      const session =
        await getSession();

      if (!session) {
        return null;
      }

      const user =
        await prisma.user.findFirst({
          where: {
            id: session.userId,
            active: true,
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
          },
        });

      if (
        !user ||
        (
          user.role !== "ADMIN" &&
          user.role !==
            "COLLABORATOR"
        )
      ) {
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    },
  );

export async function requireUser() {
  const user =
    await getCurrentUser();

  if (!user) {
    redirect(
      "/login?error=sesion-requerida",
    );
  }

  return user;
}

export async function requireAdmin() {
  const user =
    await requireUser();

  if (user.role !== "ADMIN") {
    redirect(
      "/?error=sin-permiso",
    );
  }

  return user;
}