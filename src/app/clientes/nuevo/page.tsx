import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clientOperationServiceTypes,
  getClientOperationServiceTypeLabel,
} from "@/lib/scheduled-task";
import { createClient } from "../actions";
import styles from "../clientes.module.css";

function operationTargetDate() {
  const current = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date());
  const target = new Date(`${current}T12:00:00.000Z`);
  target.setUTCDate(target.getUTCDate() + 30);
  return target.toISOString().slice(0, 10);
}

export default async function NewClientPage() {
  const [user, teamMembers] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["ADMIN", "COLLABORATOR"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Inicio de operación</span>
          <h1>Nuevo cliente</h1>
          <p>
            Registra la empresa y deja preparado el primer contacto de
            implementación.
          </p>
        </div>

        <Link className={styles.secondaryButton} href="/clientes">
          Volver a clientes
        </Link>
      </header>

      <div className={styles.newClientLayout}>
        <form action={createClient} className={styles.formPanel}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Información de la empresa</h2>
                <p>Datos principales para identificar al cliente.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Razón social *</span>
              <input
                type="text"
                name="businessName"
                placeholder="Ej. Transportes Ejemplo SpA"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Nombre de fantasía</span>
              <input
                type="text"
                name="tradeName"
                placeholder="Ej. Transportes Ejemplo"
              />
            </label>

            <label className={styles.field}>
              <span>RUT</span>
              <input
                type="text"
                name="rut"
                placeholder="76.123.456-7"
              />
            </label>

            <label className={styles.field}>
              <span>Ciudad</span>
              <input
                type="text"
                name="city"
                placeholder="Calama"
              />
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Dirección</span>
              <input
                type="text"
                name="address"
                placeholder="Dirección comercial"
              />
            </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Contacto principal</h2>
                <p>Persona responsable de la coordinación con Vialoop.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nombre del contacto</span>
              <input
                type="text"
                name="mainContactName"
                placeholder="Nombre y apellido"
              />
            </label>

            <label className={styles.field}>
              <span>Correo electrónico</span>
              <input
                type="email"
                name="email"
                placeholder="contacto@empresa.cl"
              />
            </label>

            <label className={styles.field}>
              <span>Teléfono</span>
              <input
                type="tel"
                name="phone"
                placeholder="+56 9 1234 5678"
              />
            </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Servicio y control operativo</h2>
                <p>
                  Define desde el alta qué se hará, quién responde y cuándo debe
                  estar listo.
                </p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Tipo de servicio *</span>
                <select defaultValue="WEB" name="serviceType" required>
                  {clientOperationServiceTypes.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {getClientOperationServiceTypeLabel(serviceType)}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Responsable interno *</span>
                <select
                  defaultValue={user?.id ?? teamMembers[0]?.id ?? ""}
                  name="responsibleUserId"
                  required
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${styles.field} ${styles.fullWidth}`}>
                <span>Servicio contratado o alcance principal *</span>
                <input
                  maxLength={160}
                  name="serviceName"
                  placeholder="Ej. Sitio web corporativo, software de operaciones o hosting 10 GB"
                  required
                  type="text"
                />
              </label>

              <label className={styles.field}>
                <span>Fecha objetivo *</span>
                <input
                  defaultValue={operationTargetDate()}
                  name="operationTargetDate"
                  required
                  type="date"
                />
              </label>

              <div className={styles.operationFormNote}>
                Se crearán automáticamente hitos en la Agenda operativa. No es
                necesario registrar un proyecto para comenzar.
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Contexto comercial</h2>
                <p>Estas observaciones solo serán visibles para Vialoop.</p>
              </div>
            </div>

          <label className={styles.field}>
            <span>Observaciones</span>
            <textarea
              name="internalNotes"
              rows={5}
              placeholder="Antecedentes comerciales, servicios contratados o información relevante."
            />
          </label>
          </section>

          <footer className={styles.formFooter}>
            <Link className={styles.secondaryButton} href="/clientes">
              Cancelar
            </Link>

            <div className={styles.formFooterActions}>
              <button
                className={styles.secondaryButton}
                name="nextAction"
                type="submit"
                value="detail"
              >
                Solo guardar
              </button>

              <button
                className={styles.primaryButton}
                name="nextAction"
                type="submit"
                value="welcome"
              >
                Guardar y preparar bienvenida
              </button>
            </div>
          </footer>
        </form>

        <aside className={styles.operationPanel}>
          <span className={styles.eyebrow}>Nuestra operación</span>
          <h2>Del registro a la implementación</h2>
          <p>
            El alta del cliente abre una secuencia clara para que Comercial y
            Operaciones trabajen con la misma información.
          </p>

          <ol className={styles.operationSteps}>
            <li>
              <span />
              <div>
                <strong>Alta comercial</strong>
                <small>Ficha única, servicio, responsable y fecha objetivo.</small>
              </div>
            </li>
            <li>
              <span />
              <div>
                <strong>Condiciones y bienvenida</strong>
                <small>Pago inicial y correo editable de Doris.</small>
              </div>
            </li>
            <li>
              <span />
              <div>
                <strong>Recepción de material</strong>
                <small>Contenidos y accesos validados antes de ejecutar.</small>
              </div>
            </li>
            <li>
              <span />
              <div>
                <strong>Implementación y revisión</strong>
                <small>Hitos visibles en agenda, aprobación y entrega.</small>
              </div>
            </li>
          </ol>

          <div className={styles.operationNote}>
            Al elegir <strong>Guardar y preparar bienvenida</strong>, se abrirá
            el correo premium de Doris con el cliente ya registrado.
          </div>
        </aside>
      </div>
    </main>
  );
}
