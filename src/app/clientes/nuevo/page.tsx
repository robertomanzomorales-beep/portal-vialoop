import Link from "next/link";
import { createClient } from "../actions";
import styles from "../clientes.module.css";

export default function NewClientPage() {
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
              <span className={styles.sectionNumber}>01</span>
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
              <span className={styles.sectionNumber}>02</span>
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
              <span className={styles.sectionNumber}>03</span>
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
              <span>01</span>
              <div>
                <strong>Alta comercial</strong>
                <small>Empresa, contacto y contexto del servicio.</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Bienvenida de Doris</strong>
                <small>Correo editable con fotos y archivos requeridos.</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Recepción de material</strong>
                <small>Validación de contenidos antes de comenzar.</small>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Implementación</strong>
                <small>Proyecto, planificación, revisión y publicación.</small>
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
