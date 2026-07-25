import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  DocumentFormFields,
} from "../../DocumentControls";
import {
  updateDocument,
} from "../../actions";
import styles from "../../documentos.module.css";

type EditDocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
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
        "No fue posible actualizar el documento."
    : null;
}

export default async function EditDocumentPage({
  params,
  searchParams,
}: EditDocumentPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const [
    document,
    clients,
    projects,
  ] = await Promise.all([
    prisma.document.findUnique({
      where: {
        id: resolvedParams.id,
      },
      select: {
        id: true,
        clientId: true,
        projectId: true,
        name: true,
        type: true,
        fileUrl: true,
        description: true,
        visibleToClient: true,
      },
    }),
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

  if (!document) {
    notFound();
  }

  const errorMessage = getErrorMessage(
    resolvedSearchParams.error,
  );

  const updateAction =
    updateDocument.bind(null, document.id);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            Gestión documental
          </span>

          <h1>Editar documento</h1>

          <p>
            Actualiza los datos, el acceso o el
            archivo enlazado de este documento.
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

      <form
        action={updateAction}
        className={styles.formPanel}
      >
        <DocumentFormFields
          clients={clients}
          initialDocument={document}
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
            Guardar cambios
          </button>
        </footer>
      </form>
    </main>
  );
}
