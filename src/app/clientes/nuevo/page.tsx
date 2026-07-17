import Link from "next/link";
import { createClient } from "../actions";
import styles from "../clientes.module.css";

export default function NewClientPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Nuevo registro</span>
          <h1>Crear cliente</h1>
          <p>
            Registra la información comercial y de contacto de la empresa.
          </p>
        </div>

        <Link className={styles.secondaryButton} href="/clientes">
          Volver a clientes
        </Link>
      </header>

      <form action={createClient} className={styles.formPanel}>
        <section className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h2>Información de la empresa</h2>
            <p>Datos principales para identificar al cliente.</p>
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
            <h2>Contacto principal</h2>
            <p>Persona responsable de la coordinación con Vialoop.</p>
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
            <h2>Información interna</h2>
            <p>Estas observaciones solo serán visibles para Vialoop.</p>
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

          <button className={styles.primaryButton} type="submit">
            Guardar cliente
          </button>
        </footer>
      </form>
    </main>
  );
}