import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSupportRequest } from "../actions";
import ClientProjectSelector from "./ClientProjectSelector";
import styles from "../solicitudes.module.css";

type NewSupportRequestPageProps = {
  searchParams: Promise<{ cliente?: string }>;
};

export default async function NewSupportRequestPage({
  searchParams,
}: NewSupportRequestPageProps) {
  const [{ cliente }, clients, projects] = await Promise.all([
    searchParams,
    prisma.client.findMany({
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          businessName: "asc",
        },
        select: {
          id: true,
          businessName: true,
          tradeName: true,
          email: true,
        },
    }),

    prisma.project.findMany({
        where: {
          status: {
            in: [
              "DEVELOPMENT",
              "ACTIVE",
              "MAINTENANCE",
            ],
          },
        },
        orderBy: [
          {
            client: {
              businessName: "asc",
            },
          },
          {
            name: "asc",
          },
        ],
        select: {
          id: true,
          name: true,
          domain: true,
          clientId: true,
        },
    }),
  ]);

  return (
    <main
      className={styles.page}
    >
      <header
        className={styles.header}
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            Nuevo registro
          </span>

          <h1>
            Crear solicitud
          </h1>

          <p>
            Registra el requerimiento directamente en la ficha del cliente.
            El proyecto solo se asocia cuando realmente aporta contexto.
          </p>
        </div>

        <Link
          className={
            styles.secondaryButton
          }
          href="/solicitudes"
        >
          Volver a solicitudes
        </Link>
      </header>

      {clients.length === 0 ? (
        <section
          className={styles.panel}
        >
          <div
            className={
              styles.emptyState
            }
          >
            <div
              className={
                styles.emptyIcon
              }
            >
              !
            </div>

            <h3>
              No existen clientes
              activos
            </h3>

            <p>
              Debes registrar al menos
              un cliente antes de
              crear una solicitud.
            </p>

            <Link
              className={
                styles.primaryButton
              }
              href="/clientes/nuevo"
            >
              Crear cliente
            </Link>
          </div>
        </section>
      ) : (
        <form
          action={
            createSupportRequest
          }
          className={
            styles.formPanel
          }
        >
          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <h2>
                Cliente y proyecto
              </h2>

              <p>
                Selecciona la empresa
                responsable y, cuando
                corresponda, el
                proyecto asociado.
              </p>
            </div>

            <div
              className={
                styles.formGrid
              }
            >
              <ClientProjectSelector
                clients={clients.map((client) => ({
                  id: client.id,
                  name: client.tradeName || client.businessName,
                }))}
                initialClientId={
                  clients.some((client) => client.id === cliente) ? cliente! : ""
                }
                projects={projects.map((project) => ({
                  id: project.id,
                  clientId: project.clientId,
                  name: project.domain || project.name,
                }))}
              />
            </div>
          </section>

          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <h2>
                Detalle de la solicitud
              </h2>

              <p>
                Describe claramente el
                requerimiento para
                facilitar su revisión
                y seguimiento.
              </p>
            </div>

            <div
              className={
                styles.formGrid
              }
            >
              <label
                className={`${styles.field} ${styles.fullWidth}`}
              >
                <span>
                  Asunto *
                </span>

                <input
                  maxLength={160}
                  name="subject"
                  placeholder="Ej. Actualizar información de servicios"
                  required
                  type="text"
                />
              </label>

              <label
                className={`${styles.field} ${styles.fullWidth}`}
              >
                <span>
                  Descripción *
                </span>

                <textarea
                  name="description"
                  placeholder="Explica qué necesita el cliente, qué debe modificarse y cualquier antecedente relevante."
                  required
                  rows={7}
                />
              </label>
            </div>
          </section>

          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <h2>
                Prioridad y plazo
              </h2>

              <p>
                Define el nivel de
                atención y una fecha
                estimada cuando exista
                un compromiso de
                entrega.
              </p>
            </div>

            <div
              className={
                styles.formGrid
              }
            >
              <label
                className={
                  styles.field
                }
              >
                <span>
                  Prioridad *
                </span>

                <select
                  defaultValue="NORMAL"
                  name="priority"
                  required
                >
                  <option value="LOW">
                    Baja
                  </option>

                  <option value="NORMAL">
                    Normal
                  </option>

                  <option value="HIGH">
                    Alta
                  </option>

                  <option value="URGENT">
                    Urgente
                  </option>
                </select>
              </label>

              <label
                className={
                  styles.field
                }
              >
                <span>
                  Entrega estimada
                </span>

                <input
                  name="estimatedDelivery"
                  type="date"
                />
              </label>
            </div>
          </section>

          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <h2>
                Información interna
              </h2>

              <p>
                Estas observaciones son
                de uso interno y no
                corresponden a la
                descripción pública de
                la solicitud.
              </p>
            </div>

            <label
              className={
                styles.field
              }
            >
              <span>
                Notas internas
              </span>

              <textarea
                name="internalNotes"
                placeholder="Acuerdos comerciales, antecedentes técnicos, restricciones o instrucciones para el equipo."
                rows={5}
              />
            </label>
          </section>

          <footer
            className={
              styles.formFooter
            }
          >
            <Link
              className={
                styles.secondaryButton
              }
              href="/solicitudes"
            >
              Cancelar
            </Link>

            <button
              className={
                styles.primaryButton
              }
              type="submit"
            >
              Guardar solicitud
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}
