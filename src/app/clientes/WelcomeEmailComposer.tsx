"use client";

import {
  useActionState,
  useEffect,
  useId,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import {
  sendClientWelcomeEmail,
  type WelcomeEmailActionState,
} from "./actions";
import styles from "./clientes.module.css";

type WelcomeEmailComposerProps = {
  clientId: string;
  clientName: string;
  contactName: string;
  recipient: string;
  productName: string;
  initialOpen?: boolean;
  sentCount: number;
  lastSentAt: string | null;
};

const initialState: WelcomeEmailActionState = {
  status: "idle",
  message: "",
};

const defaultRequirements = [
  "Logotipo en formato PNG de buena calidad o archivo editable.",
  "Textos definitivos de cada sección o servicio.",
  "Datos de contacto, horarios, redes sociales y ubicación.",
  "Referencias visuales o sitios que representen el estilo esperado.",
].join("\n");

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.primaryButton}
      disabled={pending}
      type="submit"
    >
      {pending ? "Enviando bienvenida…" : "Enviar correo de bienvenida"}
    </button>
  );
}

export default function WelcomeEmailComposer({
  clientId,
  clientName,
  contactName,
  recipient,
  productName,
  initialOpen = false,
  sentCount,
  lastSentAt,
}: WelcomeEmailComposerProps) {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [email, setEmail] = useState(recipient);
  const [subject, setSubject] = useState(
    `Bienvenida a Vialoop · Próximos pasos de ${clientName}`,
  );
  const action = sendClientWelcomeEmail.bind(null, clientId);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function confirmSend(event: React.FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      [
        "Este correo se enviará realmente desde Doris.",
        "",
        `Cliente: ${clientName}`,
        `Destinatario: ${email.trim()}`,
        `Asunto: ${subject.trim()}`,
        "",
        "¿Confirmas el envío?",
      ].join("\n"),
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <>
      <button
        className={styles.welcomeAction}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span>Correo de bienvenida</span>
        <strong>{sentCount > 0 ? "Enviar nuevamente" : "Preparar y enviar"}</strong>
      </button>

      {isOpen ? (
        <div
          className={styles.welcomeModalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
          role="presentation"
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.welcomeModal}
            role="dialog"
          >
            <header className={styles.welcomeModalHeader}>
              <div>
                <span className={styles.eyebrow}>Inicio de operación</span>
                <h2 id={titleId}>Bienvenida de Doris</h2>
                <p>
                  Personaliza los materiales solicitados según el producto antes
                  de enviar el correo al cliente.
                </p>
              </div>

              <button
                aria-label="Cerrar correo de bienvenida"
                className={styles.welcomeModalClose}
                onClick={() => setIsOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className={styles.welcomeContext}>
              <div>
                <span>Cliente</span>
                <strong>{clientName}</strong>
              </div>
              <div>
                <span>Remitente</span>
                <strong>Doris Loayza · Vialoop</strong>
              </div>
              <div>
                <span>Historial</span>
                <strong>
                  {sentCount === 0
                    ? "Sin envíos anteriores"
                    : `${sentCount} ${sentCount === 1 ? "envío" : "envíos"}${lastSentAt ? ` · último ${lastSentAt}` : ""}`}
                </strong>
              </div>
            </div>

            <form
              action={formAction}
              className={styles.welcomeForm}
              onSubmit={confirmSend}
            >
              <div className={styles.welcomeFormGrid}>
                <label className={styles.field}>
                  <span>Destinatario *</span>
                  <input
                    autoComplete="email"
                    name="recipient"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="contacto@empresa.cl"
                    required
                    type="email"
                    value={email}
                  />
                </label>

                <label className={styles.field}>
                  <span>Nombre del contacto</span>
                  <input
                    defaultValue={contactName}
                    name="contactName"
                    placeholder="Nombre del cliente"
                    type="text"
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Asunto *</span>
                  <input
                    maxLength={180}
                    name="subject"
                    onChange={(event) => setSubject(event.target.value)}
                    required
                    type="text"
                    value={subject}
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Producto o servicio contratado *</span>
                  <input
                    defaultValue={productName || "Sitio web corporativo"}
                    name="productName"
                    required
                    type="text"
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Mensaje de bienvenida *</span>
                  <textarea
                    defaultValue="Nos alegra darte la bienvenida a Vialoop. Para organizar el inicio del proyecto y avanzar sin retrasos, reunimos a continuación el material que necesitamos recibir para la implementación."
                    name="welcomeMessage"
                    required
                    rows={4}
                  />
                </label>

                <label className={styles.field}>
                  <span>Cantidad de fotografías</span>
                  <input
                    defaultValue={12}
                    max={500}
                    min={0}
                    name="photoCount"
                    type="number"
                  />
                </label>

                <label className={styles.field}>
                  <span>Cantidad de archivos o documentos</span>
                  <input
                    defaultValue={4}
                    max={500}
                    min={0}
                    name="fileCount"
                    type="number"
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Materiales requeridos · uno por línea *</span>
                  <textarea
                    defaultValue={defaultRequirements}
                    name="requirements"
                    required
                    rows={6}
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Consideración específica del proyecto</span>
                  <textarea
                    name="additionalNotes"
                    placeholder="Ej. Las fotografías deben entregarse en formato horizontal y vertical."
                    rows={3}
                  />
                </label>
              </div>

              {state.status !== "idle" ? (
                <p
                  aria-live="polite"
                  className={
                    state.status === "success"
                      ? styles.welcomeSuccess
                      : styles.welcomeError
                  }
                  role="status"
                >
                  {state.message}
                </p>
              ) : null}

              <footer className={styles.welcomeFormFooter}>
                <p>
                  El correo usa la línea visual gris y azul de Vialoop y quedará
                  registrado en la ficha del cliente.
                </p>
                <div>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    Cerrar
                  </button>
                  <SubmitButton />
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
