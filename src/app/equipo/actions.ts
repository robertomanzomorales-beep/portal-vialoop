"use server";

import {
  revalidatePath,
} from "next/cache";
import {
  redirect,
} from "next/navigation";
import {
  requireAdmin,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type InternalRole =
  | "ADMIN"
  | "COLLABORATOR";

const allowedRoles: InternalRole[] = [
  "ADMIN",
  "COLLABORATOR",
];

function getRequiredString(
  formData: FormData,
  field: string,
  label: string,
) {
  const value =
    formData.get(field);

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${label} es obligatorio.`,
    );
  }

  return value.trim();
}

function normalizeEmail(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function getInternalRole(
  formData: FormData,
): InternalRole {
  const value =
    getRequiredString(
      formData,
      "role",
      "El rol",
    );

  if (
    !allowedRoles.includes(
      value as InternalRole,
    )
  ) {
    throw new Error(
      "El rol seleccionado no es válido.",
    );
  }

  return value as InternalRole;
}

function getRoleLabel(
  role: string,
) {
  const labels: Record<
    string,
    string
  > = {
    ADMIN: "Administrador",
    COLLABORATOR:
      "Colaborador",
  };

  return labels[role] ?? role;
}

export async function createTeamMember(
  formData: FormData,
) {
  const administrator =
    await requireAdmin();

  const name =
    getRequiredString(
      formData,
      "name",
      "El nombre",
    );

  const email = normalizeEmail(
    getRequiredString(
      formData,
      "email",
      "El correo electrónico",
    ),
  );

  const role =
    getInternalRole(formData);

  if (!isValidEmail(email)) {
    throw new Error(
      "El correo electrónico ingresado no es válido.",
    );
  }

  const existingUser =
    await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

  if (existingUser) {
    redirect(
      "/equipo/nuevo?error=correo-duplicado",
    );
  }

  await prisma.$transaction(
    async (transaction) => {
      const createdUser =
        await transaction.user.create({
          data: {
            name,
            email,
            role,
            active: true,
            passwordHash: null,
            clientId: null,
          },
        });

      await transaction.activityLog.create({
        data: {
          userId:
            administrator.id,
          action:
            "TEAM_MEMBER_CREATED",
          entityType: "User",
          entityId:
            createdUser.id,
          description: `${administrator.name} registró a ${name} como ${getRoleLabel(
            role,
          ).toLowerCase()}.`,
          metadata: {
            createdUserId:
              createdUser.id,
            name,
            email,
            role,
            active: true,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/equipo");
  revalidatePath("/solicitudes");

  redirect(
    "/equipo?resultado=creado",
  );
}

export async function toggleTeamMemberStatus(
  userId: string,
) {
  const administrator =
    await requireAdmin();

  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

  if (!user) {
    throw new Error(
      "El integrante seleccionado no existe.",
    );
  }

  if (
    user.role !== "ADMIN" &&
    user.role !==
      "COLLABORATOR"
  ) {
    throw new Error(
      "Solo se pueden administrar usuarios internos.",
    );
  }

  if (
    user.id ===
      administrator.id &&
    user.active
  ) {
    redirect(
      "/equipo?error=cuenta-propia",
    );
  }

  if (
    user.active &&
    user.role === "ADMIN"
  ) {
    const activeAdministratorCount =
      await prisma.user.count({
        where: {
          role: "ADMIN",
          active: true,
        },
      });

    if (
      activeAdministratorCount <= 1
    ) {
      redirect(
        "/equipo?error=ultimo-administrador",
      );
    }
  }

  const nextActiveStatus =
    !user.active;

  await prisma.$transaction(
    async (transaction) => {
      await transaction.user.update({
        where: {
          id: user.id,
        },
        data: {
          active:
            nextActiveStatus,
        },
      });

      await transaction.activityLog.create({
        data: {
          userId:
            administrator.id,
          action:
            nextActiveStatus
              ? "TEAM_MEMBER_ACTIVATED"
              : "TEAM_MEMBER_DEACTIVATED",
          entityType: "User",
          entityId: user.id,
          description: `${administrator.name} ${
            nextActiveStatus
              ? "activó"
              : "desactivó"
          } la cuenta de ${user.name}.`,
          metadata: {
            affectedUserId:
              user.id,
            email: user.email,
            role: user.role,
            active:
              nextActiveStatus,
          },
        },
      });
    },
  );

  revalidatePath("/");
  revalidatePath("/equipo");
  revalidatePath("/solicitudes");

  redirect(
    `/equipo?resultado=${
      nextActiveStatus
        ? "activado"
        : "desactivado"
    }`,
  );
}