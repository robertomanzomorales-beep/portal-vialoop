"use client";

import { useMemo, useState } from "react";
import styles from "../solicitudes.module.css";

type ClientOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  clientId: string;
  name: string;
};

export default function ClientProjectSelector({
  clients,
  projects,
  initialClientId,
}: {
  clients: ClientOption[];
  projects: ProjectOption[];
  initialClientId: string;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [projectId, setProjectId] = useState("");
  const availableProjects = useMemo(
    () => projects.filter((project) => project.clientId === clientId),
    [clientId, projects],
  );

  return (
    <>
      <label className={styles.field}>
        <span>Cliente *</span>
        <select
          name="clientId"
          onChange={(event) => {
            setClientId(event.target.value);
            setProjectId("");
          }}
          required
          value={clientId}
        >
          <option disabled value="">Seleccionar cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <small>Los datos de contacto se obtienen desde la ficha del cliente.</small>
      </label>

      <label className={styles.field}>
        <span>Proyecto (opcional)</span>
        <select
          disabled={!clientId || availableProjects.length === 0}
          name="projectId"
          onChange={(event) => setProjectId(event.target.value)}
          value={projectId}
        >
          <option value="">
            {!clientId
              ? "Primero selecciona un cliente"
              : availableProjects.length === 0
                ? "Cliente sin proyectos"
                : "Sin proyecto específico"}
          </option>
          {availableProjects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <small>
          No necesitas crear un proyecto para registrar o atender una solicitud.
        </small>
      </label>
    </>
  );
}
