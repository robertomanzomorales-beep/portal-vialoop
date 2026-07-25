import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateClient } from "../../actions";
import styles from "../../clientes.module.css";

type EditClientPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDateForInput(date: Date | null | undefined) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatAmountForInput(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? String(amount) : "";
}

export default async function EditClientPage({
  params,
}: EditClientPageProps) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: {
      id,
    },
  });

  if (!client) {
    notFound();
  }

  const [mainProject, clientRenewals] = await Promise.all([
    prisma.project.findFirst({
      where: {
        clientId: client.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.renewal.findMany({
      where: {
        clientId: client.id,
      },
      orderBy: {
        dueDate: "asc",
      },
    }),
  ]);

  const projectRenewals = mainProject
    ? clientRenewals.filter(
        (renewal) => renewal.projectId === mainProject.id,
      )
    : [];

  const mainRenewal =
    projectRenewals.find(
      (renewal) =>
        renewal.status === "UPCOMING" ||
        renewal.status === "NOTIFIED" ||
        renewal.status === "EXPIRED",
    ) ??
    projectRenewals[0] ??
    clientRenewals[0] ??
    null;

  const updateClientWithId = updateClient.bind(null, client.id);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Edición de cliente</span>

          <h1>{client.businessName}</h1>

          <p>
            Actualiza los datos comerciales, contacto, hosting y próxima
            renovación.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href={`/clientes/${client.id}`}
          >
            Volver a la ficha
          </Link>
        </div>
      </header>

      <form action={updateClientWithId} className={styles.formPanel}>
        <input
          type="hidden"
          name="projectId"
          value={mainProject?.id ?? ""}
        />

        <input
          type="hidden"
          name="renewalId"
          value={mainRenewal?.id ?? ""}
        />

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Información de la empresa</h2>

            <p>Antecedentes generales y estado comercial del cliente.</p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Razón social *</span>

              <input
                type="text"
                name="businessName"
                defaultValue={client.businessName}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Nombre de fantasía</span>

              <input
                type="text"
                name="tradeName"
                defaultValue={client.tradeName ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>RUT</span>

              <input
                type="text"
                name="rut"
                defaultValue={client.rut ?? ""}
                placeholder="76.123.456-7"
              />
            </label>

            <label className={styles.field}>
              <span>Estado del cliente</span>

              <select
                name="clientStatus"
                defaultValue={client.status}
              >
                <option value="ACTIVE">Activo</option>
                <option value="SUSPENDED">Suspendido</option>
                <option value="FINISHED">Finalizado</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Ciudad</span>

              <input
                type="text"
                name="city"
                defaultValue={client.city ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Dirección</span>

              <input
                type="text"
                name="address"
                defaultValue={client.address ?? ""}
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Contacto principal</h2>

            <p>
              Persona responsable de comunicaciones, coordinación y cobros.
            </p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nombre del contacto</span>

              <input
                type="text"
                name="mainContactName"
                defaultValue={client.mainContactName ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Correo electrónico</span>

              <input
                type="email"
                name="email"
                defaultValue={client.email ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Teléfono</span>

              <input
                type="tel"
                name="phone"
                defaultValue={client.phone ?? ""}
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Proyecto, sitio web y hosting</h2>

            <p>
              Información técnica del proyecto principal asociado al cliente.
            </p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nombre del proyecto</span>

              <input
                type="text"
                name="projectName"
                defaultValue={mainProject?.name ?? ""}
                placeholder="Ej. Sitio web corporativo"
              />
            </label>

            <label className={styles.field}>
              <span>Dominio</span>

              <input
                type="text"
                name="domain"
                defaultValue={mainProject?.domain ?? ""}
                placeholder="empresa.cl"
              />
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>URL del sitio web</span>

              <input
                type="url"
                name="websiteUrl"
                defaultValue={mainProject?.websiteUrl ?? ""}
                placeholder="https://empresa.cl"
              />
            </label>

            <label className={styles.field}>
              <span>Tipo de sitio</span>

              <input
                type="text"
                name="websiteType"
                defaultValue={mainProject?.websiteType ?? ""}
                placeholder="Landing, corporativo, ecommerce..."
              />
            </label>

            <label className={styles.field}>
              <span>Tecnología</span>

              <input
                type="text"
                name="technology"
                defaultValue={mainProject?.technology ?? ""}
                placeholder="Next.js, WordPress..."
              />
            </label>

            <label className={styles.field}>
              <span>Proveedor de hosting</span>

              <input
                type="text"
                name="hostingProvider"
                defaultValue={mainProject?.hostingProvider ?? ""}
                placeholder="Vialoop / BenzaHosting"
              />
            </label>

            <label className={styles.field}>
              <span>Capacidad de hosting</span>

              <input
                type="text"
                name="hostingCapacity"
                defaultValue={mainProject?.hostingCapacity ?? ""}
                placeholder="8 GB"
              />
            </label>

            <label className={styles.field}>
              <span>Fecha de renovación del hosting</span>

              <input
                type="date"
                name="hostingRenewalDate"
                defaultValue={formatDateForInput(
                  mainProject?.hostingRenewalDate,
                )}
              />
            </label>

            <label className={styles.field}>
              <span>Fecha de renovación del dominio</span>

              <input
                type="date"
                name="domainRenewalDate"
                defaultValue={formatDateForInput(
                  mainProject?.domainRenewalDate,
                )}
              />
            </label>

            <label className={styles.field}>
              <span>Correo de formularios</span>

              <input
                type="email"
                name="formRecipientEmail"
                defaultValue={mainProject?.formRecipientEmail ?? ""}
                placeholder="contacto@empresa.cl"
              />
            </label>

            <label className={styles.field}>
              <span>Estado del proyecto</span>

              <select
                name="projectStatus"
                defaultValue={mainProject?.status ?? "ACTIVE"}
              >
                <option value="DEVELOPMENT">En desarrollo</option>
                <option value="ACTIVE">Activo</option>
                <option value="MAINTENANCE">En mantención</option>
                <option value="SUSPENDED">Suspendido</option>
                <option value="FINISHED">Finalizado</option>
              </select>
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Observaciones del proyecto</span>

              <textarea
                name="projectNotes"
                rows={4}
                defaultValue={mainProject?.notes ?? ""}
                placeholder="Información técnica, accesos pendientes o condiciones del servicio."
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Próxima renovación y cobro</h2>

            <p>
              Fecha, monto y estado del próximo vencimiento del servicio.
            </p>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Tipo de renovación</span>

              <select
                name="renewalType"
                defaultValue={mainRenewal?.type ?? "HOSTING"}
              >
                <option value="HOSTING">Hosting</option>
                <option value="DOMAIN">Dominio</option>
                <option value="EMAIL">Correo</option>
                <option value="SSL">Certificado SSL</option>
                <option value="SUBSCRIPTION">
                  Suscripción recurrente
                </option>
                <option value="ADDITIONAL_SERVICE">
                  Servicio adicional
                </option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Estado de la renovación</span>

              <select
                name="renewalStatus"
                defaultValue={mainRenewal?.status ?? "UPCOMING"}
              >
                <option value="UPCOMING">Próxima</option>
                <option value="NOTIFIED">Notificada</option>
                <option value="PAID">Pagada</option>
                <option value="RENEWED">Renovada</option>
                <option value="EXPIRED">Vencida</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Descripción</span>

              <input
                type="text"
                name="renewalDescription"
                defaultValue={
                  mainRenewal?.description ??
                  "Renovación de hosting"
                }
              />
            </label>

            <label className={styles.field}>
              <span>Fecha de vencimiento</span>

              <input
                type="date"
                name="renewalDueDate"
                defaultValue={formatDateForInput(
                  mainRenewal?.dueDate ??
                    mainProject?.hostingRenewalDate,
                )}
              />
            </label>

            <label className={styles.field}>
              <span>Monto a cobrar</span>

              <input
                type="number"
                name="renewalAmount"
                min="0"
                step="1"
                defaultValue={formatAmountForInput(
                  mainRenewal?.amount,
                )}
                placeholder="159000"
              />
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Observaciones de la renovación</span>

              <textarea
                name="renewalNotes"
                rows={4}
                defaultValue={mainRenewal?.notes ?? ""}
                placeholder="Información del cobro, condiciones o antecedentes del vencimiento."
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Observaciones internas</h2>

            <p>
              Información visible únicamente para el equipo de Vialoop.
            </p>
          </div>

          <label className={styles.field}>
            <span>Observaciones del cliente</span>

            <textarea
              name="internalNotes"
              rows={6}
              defaultValue={client.internalNotes ?? ""}
              placeholder="Antecedentes comerciales, acuerdos, historial o información relevante."
            />
          </label>
        </section>

        <footer className={styles.formFooter}>
          <Link
            className={styles.secondaryButton}
            href={`/clientes/${client.id}`}
          >
            Cancelar
          </Link>

          <button className={styles.primaryButton} type="submit">
            Guardar cambios
          </button>
        </footer>
      </form>
    </main>
  );
}