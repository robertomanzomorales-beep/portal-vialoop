import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DocumentFormFields,
} from "../DocumentControls";
import { createDocument } from "../actions";
import styles from "../documentos.module.css";

type NewDocumentPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function getErrorMessage(
  error: string | undefined,
) {
  const messages: Record<string, string> = {
    campos:
      "Completa el cliente, el nombre y el enlace del archivo.",
    enlace:
      "El enlace del archivo no es válido. Debe comenzar con http:// o https://.",
    cliente:
      "El cliente seleccionado no existe o ya no está disponible.",
    proyecto:
      "El proyecto seleccionado no pertenece al cliente indicado.",
  };

  return error
    ? messages[error] ??
        "No fue posible registrar el documento."
    : null;
}

export default async function NewDocumentPage({
  searchParams,
}: NewDocumentPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const errorMessage = getErrorMessage(
    resolvedSearchParams.error,
  );

  const [
    clients,
    projects,
  ] = await Promise.all([
    prisma.client.findMany({
      orderBy: {
        businessName: "asc",
      },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        status: true,
      },
    }),
    prisma.project.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        clientId: true,
        name: true,
        domain: true,
      },
    }),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Gestión documental
          </span>

          <h1>Nuevo documento</h1>

          <p>
            Registra un archivo y relaciónalo con el
            cliente o proyecto correspondiente.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href="/documentos"
          >
            Volver a documentos
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className={styles.errorMessage}>
          {errorMessage}
        </div>
      )}

      {clients.length === 0 ? (
        <section className={styles.panel}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              !
            </div>

            <h3>No existen clientes registrados</h3>

            <p>
              Debes crear un cliente antes de
              registrar documentos en el sistema.
            </p>

            <Link
              className={styles.primaryButton}
              href="/clientes/nuevo"
            >
              Crear cliente
            </Link>
          </div>
        </section>
      ) : (
        <form
          action={createDocument}
          className={styles.formPanel}
        >
          <DocumentFormFields
            clients={clients}
            projects={projects}
          />

          <footer className={styles.formFooter}>
            <Link
              className={styles.secondaryButton}
              href="/documentos"
            >
              Cancelar
            </Link>

            <button
              className={styles.primaryButton}
              type="submit"
            >
              Guardar documento
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}
