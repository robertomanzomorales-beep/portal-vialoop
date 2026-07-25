"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { deleteDocument } from "./actions";
import styles from "./documentos.module.css";

type ClientOption = {
  id: string;
  businessName: string;
  tradeName: string | null;
  status: string;
};

type ProjectOption = {
  id: string;
  clientId: string;
  name: string;
  domain: string | null;
};

type InitialDocument = {
  clientId: string;
  projectId: string | null;
  name: string;
  type: string;
  fileUrl: string;
  description: string | null;
  visibleToClient: boolean;
};

type DocumentFormFieldsProps = {
  clients: ClientOption[];
  projects: ProjectOption[];
  initialDocument?: InitialDocument;
};

function getClientStatusLabel(
  status: string,
) {
  const labels: Record<string, string> = {
    ACTIVE: "Activo",
    SUSPENDED: "Suspendido",
    FINISHED: "Finalizado",
  };

  return labels[status] ?? status;
}

export function DocumentFormFields({
  clients,
  projects,
  initialDocument,
}: DocumentFormFieldsProps) {
  const [
    selectedClientId,
    setSelectedClientId,
  ] = useState(
    initialDocument?.clientId ?? "",
  );

  const [
    selectedProjectId,
    setSelectedProjectId,
  ] = useState(
    initialDocument?.projectId ?? "",
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.clientId ===
          selectedClientId,
      ),
    [
      projects,
      selectedClientId,
    ],
  );

  function handleClientChange(
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    setSelectedClientId(
      event.currentTarget.value,
    );
    setSelectedProjectId("");
  }

  return (
    <>
      <section className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <h2>Cliente y proyecto</h2>

          <p>
            Define a quién pertenece el documento y,
            si corresponde, su proyecto asociado.
          </p>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Cliente *</span>

            <select
              name="clientId"
              onChange={handleClientChange}
              required
              value={selectedClientId}
            >
              <option disabled value="">
                Seleccionar cliente
              </option>

              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.businessName}
                  {client.tradeName
                    ? ` · ${client.tradeName}`
                    : ""}
                  {` · ${getClientStatusLabel(
                    client.status,
                  )}`}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Proyecto</span>

            <select
              disabled={
                !selectedClientId ||
                filteredProjects.length === 0
              }
              name="projectId"
              onChange={(event) =>
                setSelectedProjectId(
                  event.currentTarget.value,
                )
              }
              value={selectedProjectId}
            >
              <option value="">
                {!selectedClientId
                  ? "Primero selecciona un cliente"
                  : filteredProjects.length === 0
                    ? "Este cliente no tiene proyectos"
                    : "Sin proyecto específico"}
              </option>

              {filteredProjects.map((project) => (
                <option
                  key={project.id}
                  value={project.id}
                >
                  {project.domain ??
                    project.name}
                </option>
              ))}
            </select>

            <small>
              Solo se muestran los proyectos del
              cliente seleccionado.
            </small>
          </label>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <h2>Información del documento</h2>

          <p>
            Identifica el archivo para poder
            encontrarlo y clasificarlo
            posteriormente.
          </p>
        </div>

        <div className={styles.formGrid}>
          <label
            className={`${styles.field} ${styles.fullWidth}`}
          >
            <span>Nombre del documento *</span>

            <input
              defaultValue={
                initialDocument?.name ?? ""
              }
              name="name"
              placeholder="Ej. Contrato de desarrollo sitio web"
              required
              type="text"
            />
          </label>

          <label className={styles.field}>
            <span>Tipo de documento *</span>

            <select
              defaultValue={
                initialDocument?.type ?? "OTHER"
              }
              name="type"
              required
            >
              <option value="CONTRACT">
                Contrato
              </option>
              <option value="QUOTATION">
                Cotización
              </option>
              <option value="INVOICE">
                Factura
              </option>
              <option value="PAYMENT_RECEIPT">
                Comprobante de pago
              </option>
              <option value="REPORT">
                Informe
              </option>
              <option value="MANUAL">
                Manual
              </option>
              <option value="LOGO">
                Logo
              </option>
              <option value="TEXT">
                Texto
              </option>
              <option value="IMAGE">
                Imagen
              </option>
              <option value="BACKUP">
                Respaldo
              </option>
              <option value="TECHNICAL">
                Documento técnico
              </option>
              <option value="OTHER">
                Otro
              </option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Acceso</span>

            <span
              className={styles.checkboxCard}
            >
              <input
                defaultChecked={
                  initialDocument
                    ? initialDocument.visibleToClient
                    : true
                }
                name="visibleToClient"
                type="checkbox"
              />

              <span>
                <strong>
                  Visible para el cliente
                </strong>

                <small>
                  Desmarca esta opción si el archivo
                  es solo para uso interno de
                  Vialoop.
                </small>
              </span>
            </span>
          </label>

          <label
            className={`${styles.field} ${styles.fullWidth}`}
          >
            <span>Enlace del archivo *</span>

            <input
              defaultValue={
                initialDocument?.fileUrl ?? ""
              }
              name="fileUrl"
              placeholder="https://..."
              required
              type="url"
            />

            <small>
              Utiliza el enlace compartido del
              archivo alojado en Drive, Dropbox,
              OneDrive o el almacenamiento que use
              Vialoop.
            </small>
          </label>

          <label
            className={`${styles.field} ${styles.fullWidth}`}
          >
            <span>Descripción</span>

            <textarea
              defaultValue={
                initialDocument?.description ?? ""
              }
              name="description"
              placeholder="Contenido, vigencia, versión u observaciones relevantes."
              rows={5}
            />
          </label>
        </div>
      </section>
    </>
  );
}

type DeleteDocumentButtonProps = {
  documentId: string;
  documentName: string;
};

export function DeleteDocumentButton({
  documentId,
  documentName,
}: DeleteDocumentButtonProps) {
  const deleteAction =
    deleteDocument.bind(null, documentId);

  function confirmDeletion(
    event: FormEvent<HTMLFormElement>,
  ) {
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar "${documentName}"? Esta acción quitará el registro del Portal, pero no borrará el archivo original de Drive u otro almacenamiento.`,
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={deleteAction}
      className={styles.deleteForm}
      onSubmit={confirmDeletion}
    >
      <button
        className={styles.dangerButton}
        type="submit"
      >
        Eliminar
      </button>
    </form>
  );
}
