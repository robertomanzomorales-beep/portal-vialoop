import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  hashPassword,
  validatePasswordStrength,
} from "../src/lib/password";

function readHiddenInput(
  prompt: string,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      if (!process.stdin.isTTY) {
        reject(
          new Error(
            "La terminal actual no permite ingresar la contraseña de forma segura.",
          ),
        );

        return;
      }

      const stdin =
        process.stdin;

      const previousRawMode =
        stdin.isRaw ?? false;

      let value = "";

      const cleanup = () => {
        stdin.off(
          "data",
          handleData,
        );

        stdin.setRawMode(
          previousRawMode,
        );

        stdin.pause();
      };

      const finish = () => {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
      };

      const cancel = () => {
        cleanup();
        process.stdout.write("\n");
        reject(
          new Error(
            "Operación cancelada.",
          ),
        );
      };

      const handleData = (
        chunk:
          | Buffer
          | string,
      ) => {
        const input =
          chunk.toString();

        for (const character of input) {
          if (
            character === "\u0003"
          ) {
            cancel();
            return;
          }

          if (
            character === "\r" ||
            character === "\n"
          ) {
            finish();
            return;
          }

          if (
            character === "\u007f"
          ) {
            if (value.length > 0) {
              value =
                value.slice(0, -1);

              process.stdout.write(
                "\b \b",
              );
            }

            continue;
          }

          if (
            character >= " "
          ) {
            value += character;
            process.stdout.write("*");
          }
        }
      };

      process.stdout.write(prompt);

      stdin.setEncoding("utf8");
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on(
        "data",
        handleData,
      );
    },
  );
}

async function main() {
  const email =
    process.argv[2]
      ?.trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      "Debes indicar el correo del usuario.",
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
      },
    });

  if (!user) {
    throw new Error(
      "No existe un usuario interno con ese correo.",
    );
  }

  if (!user.active) {
    throw new Error(
      "La cuenta está inactiva. Actívala antes de configurar su contraseña.",
    );
  }

  const password =
    await readHiddenInput(
      "Nueva contraseña: ",
    );

  const validationError =
    validatePasswordStrength(
      password,
    );

  if (validationError) {
    throw new Error(
      validationError,
    );
  }

  const confirmation =
    await readHiddenInput(
      "Confirmar contraseña: ",
    );

  if (
    password !== confirmation
  ) {
    throw new Error(
      "Las contraseñas no coinciden.",
    );
  }

  const passwordHash =
    await hashPassword(password);

  await prisma.$transaction(
    async (transaction) => {
      await transaction.user.update({
        where: {
          id: user.id,
        },
        data: {
          passwordHash,
        },
      });

      await transaction.activityLog.create({
        data: {
          userId: user.id,
          action:
            "USER_PASSWORD_CONFIGURED",
          entityType: "User",
          entityId: user.id,
          description: `Se configuró una nueva contraseña de acceso para ${user.name}.`,
          metadata: {
            email: user.email,
            role: user.role,
            source:
              "administrative-script",
          },
        },
      });
    },
  );

  console.log(
    `Contraseña configurada correctamente para ${user.name} (${user.email}).`,
  );
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado.";

    console.error(
      `Error: ${message}`,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });