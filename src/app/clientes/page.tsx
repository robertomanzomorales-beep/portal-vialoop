import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./clientes.module.css";

function getStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Activo";
    case "SUSPENDED":
      return "Suspendido";
    case "FINISHED":
      return "Finalizado";
    default:
      return status;
  }
}

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          projects: true,
          supportRequests: true,
          subscriptions: true,
        },
      },
    },
  });

  const activeClients = clients.filter(
    (client) => client.status === "ACTIVE",
  ).length;

  const totalProjects = clients.reduce(
    (total, client) => total + client._count.projects,
    0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Gestión comercial</span>

          <h1>Clientes</h1>

          <p>
            Administra las empresas, contactos, proyectos y servicios
            recurrentes de Vialoop.
          </p>
        </div>

        <Link className={styles.primaryButton} href="/clientes/nuevo">
          Nuevo cliente
        </Link>
      </header>

      <section className={styles.summary}>
        <article>
          <span>Total de clientes</span>
          <strong>{clients.length}</strong>
        </article>

        <article>
          <span>Clientes activos</span>
          <strong>{activeClients}</strong>
        </article>

        <article>
          <span>Proyectos registrados</span>
          <strong>{totalProjects}</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Directorio de clientes</h2>

            <p>
              Selecciona una empresa para revisar y editar su información,
              hosting y renovaciones.
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>+</div>

            <h3>Todavía no existen clientes registrados</h3>

            <p>
              Crea el primer cliente para comenzar a asociar proyectos, planes,
              renovaciones y solicitudes.
            </p>

            <Link className={styles.primaryButton} href="/clientes/nuevo">
              Crear primer cliente
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contacto</th>
                  <th>Ciudad</th>
                  <th>Proyectos</th>
                  <th>Solicitudes</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>

              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link
                        className={styles.companyLink}
                        href={`/clientes/${client.id}`}
                        aria-label={`Abrir ficha de ${client.businessName}`}
                      >
                        <div className={styles.companyCell}>
                          <div className={styles.companyMark}>
                            {client.businessName.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <strong>{client.businessName}</strong>

                            <span>
                              {client.rut ?? "Sin RUT registrado"}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </td>

                    <td>
                      <strong className={styles.contactName}>
                        {client.mainContactName ?? "Sin contacto"}
                      </strong>

                      <span className={styles.secondaryText}>
                        {client.email ?? "Sin correo"}
                      </span>
                    </td>

                    <td>{client.city ?? "Sin ciudad"}</td>

                    <td>{client._count.projects}</td>

                    <td>{client._count.supportRequests}</td>

                    <td>
                      <span
                        className={`${styles.status} ${
                          client.status === "ACTIVE"
                            ? styles.statusActive
                            : styles.statusInactive
                        }`}
                      >
                        {getStatusLabel(client.status)}
                      </span>
                    </td>

                    <td>
                      <Link
                        className={styles.viewButton}
                        href={`/clientes/${client.id}`}
                      >
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}