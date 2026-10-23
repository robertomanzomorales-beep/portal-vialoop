"use client";

import {
  useActionState,
  useMemo,
  useState,
} from "react";
import {
  buildProspectMessages,
  getProspectStatusLabel,
  prospectStatuses,
  type ProspectMetadata,
  type ProspectStatus,
} from "@/lib/prospect";
import {
  deleteProspect,
  saveProspect,
  type ProspectActionState,
} from "./actions";
import styles from "./seguimiento.module.css";

export type ProspectRecord = {
  id: string;
  createdAt: string;
  metadata: ProspectMetadata;
};

const initialActionState: ProspectActionState = {
  ok: false,
  message: "",
};

function formatDate(value: string) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(
    `${value}T12:00:00Z`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dateTone(dateKey: string) {
  if (!dateKey) {
    return styles.dateNeutral;
  }

  const today =
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    }).format(new Date());

  if (dateKey < today) {
    return styles.dateOverdue;
  }

  if (dateKey === today) {
    return styles.dateToday;
  }

  return styles.dateUpcoming;
}

function whatsappUrl(
  phone: string,
  message: string,
) {
  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function emailUrl(
  email: string,
  subject: string,
  message: string,
) {
  if (!email) {
    return "";
  }

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

export default function ProspectManager({
  prospects,
}: {
  prospects: ProspectRecord[];
}) {
  const [state, formAction, pending] =
    useActionState(
      saveProspect,
      initialActionState,
    );

  const [editing, setEditing] =
    useState<ProspectRecord | null>(null);
  const [formVersion, setFormVersion] =
    useState(0);
  const [query, setQuery] =
    useState("");
  const [status, setStatus] =
    useState<ProspectStatus | "ALL">(
      "ALL",
    );
  const [copiedId, setCopiedId] =
    useState<string | null>(null);

  const filteredProspects = useMemo(() => {
    const normalizedQuery = normalize(
      query.trim(),
    );

    return prospects.filter(
      ({ metadata }) => {
        const matchesStatus =
          status === "ALL" ||
          metadata.status === status;

        if (!matchesStatus) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalize(
          [
            metadata.company,
            metadata.contactName,
            metadata.email,
            metadata.industry,
            metadata.interest,
          ].join(" "),
        );

        return haystack.includes(
          normalizedQuery,
        );
      },
    );
  }, [prospects, query, status]);

  const startNew = () => {
    setEditing(null);
    setFormVersion(
      (current) => current + 1,
    );
  };

  const copyMessage = async (
    id: string,
    message: string,
  ) => {
    await navigator.clipboard.writeText(
      message,
    );
    setCopiedId(id);
    window.setTimeout(
      () => setCopiedId(null),
      1800,
    );
  };

  return (
    <>
      <section className={styles.editorPanel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>
              {editing
                ? "Editar oportunidad"
                : "Nueva oportunidad"}
            </span>
            <h2>
              {editing
                ? editing.metadata.company
                : "Agregar prospecto"}
            </h2>
          </div>

          {editing && (
            <button
              className={styles.secondaryButton}
              onClick={startNew}
              type="button"
            >
              + Nuevo prospecto
            </button>
          )}
        </div>

        <form
          action={formAction}
          className={styles.prospectForm}
          key={`${editing?.id ?? "new"}-${formVersion}`}
        >
          <input
            name="id"
            type="hidden"
            value={editing?.id ?? ""}
          />

          <label>
            <span>Empresa o prospecto *</span>
            <input
              defaultValue={
                editing?.metadata.company
              }
              name="company"
              placeholder="Nombre comercial"
              required
            />
          </label>

          <label>
            <span>Contacto</span>
            <input
              defaultValue={
                editing?.metadata.contactName
              }
              name="contactName"
              placeholder="Nombre y apellido"
            />
          </label>

          <label>
            <span>Correo</span>
            <input
              defaultValue={
                editing?.metadata.email
              }
              name="email"
              placeholder="contacto@empresa.cl"
              type="email"
            />
          </label>

          <label>
            <span>Teléfono / WhatsApp</span>
            <input
              defaultValue={
                editing?.metadata.phone
              }
              name="phone"
              placeholder="56912345678"
              type="tel"
            />
          </label>

          <label>
            <span>Industria</span>
            <input
              defaultValue={
                editing?.metadata.industry
              }
              list="prospect-industries"
              name="industry"
              placeholder="Ej.: Construcción"
            />
          </label>

          <label>
            <span>Origen</span>
            <input
              defaultValue={
                editing?.metadata.source
              }
              list="prospect-sources"
              name="source"
              placeholder="Ej.: Referido"
            />
          </label>

          <label>
            <span>Estado *</span>
            <select
              defaultValue={
                editing?.metadata.status ??
                "NEW"
              }
              name="status"
              required
            >
              {prospectStatuses.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {getProspectStatusLabel(
                      item,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Próximo seguimiento</span>
            <input
              defaultValue={
                editing?.metadata.nextFollowUp
              }
              name="nextFollowUp"
              type="date"
            />
          </label>

          <label>
            <span>Responsable</span>
            <select
              defaultValue={
                editing?.metadata.assignedTo ||
                "Doris"
              }
              name="assignedTo"
            >
              <option value="Doris">
                Doris
              </option>
              <option value="Roberto">
                Roberto
              </option>
              <option value="Equipo">
                Equipo
              </option>
            </select>
          </label>

          <label
            className={styles.wideField}
          >
            <span>Interés o servicio</span>
            <input
              defaultValue={
                editing?.metadata.interest
              }
              name="interest"
              placeholder="Sitio web, software, hosting..."
            />
          </label>

          <label
            className={styles.wideField}
          >
            <span>Notas</span>
            <textarea
              defaultValue={
                editing?.metadata.notes
              }
              name="notes"
              placeholder="Acuerdos, objeciones y próximo paso"
              rows={4}
            />
          </label>

          <datalist id="prospect-industries">
            <option value="Construcción" />
            <option value="Comercio" />
            <option value="Servicios profesionales" />
            <option value="Salud" />
            <option value="Educación" />
            <option value="Turismo" />
            <option value="Transporte" />
          </datalist>

          <datalist id="prospect-sources">
            <option value="Referido" />
            <option value="Sitio web" />
            <option value="WhatsApp" />
            <option value="Redes sociales" />
            <option value="Prospección directa" />
          </datalist>

          <div className={styles.formActions}>
            {state.message && (
              <p
                className={
                  state.ok
                    ? styles.successMessage
                    : styles.errorMessage
                }
              >
                {state.message}
              </p>
            )}

            <button
              className={styles.primaryButton}
              disabled={pending}
              type="submit"
            >
              {pending
                ? "Guardando..."
                : editing
                  ? "Guardar cambios"
                  : "Agregar prospecto"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.pipelinePanel}>
        <div className={styles.pipelineHeader}>
          <div>
            <span className={styles.eyebrow}>
              Pipeline comercial
            </span>
            <h2>
              Prospectos y próximos pasos
            </h2>
          </div>

          <a
            className={styles.exportButton}
            href="/api/seguimiento/exportar"
          >
            Exportar CSV
          </a>
        </div>

        <div className={styles.filters}>
          <label>
            <span className={styles.srOnly}>
              Buscar prospectos
            </span>
            <input
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buscar empresa, contacto o industria"
              type="search"
              value={query}
            />
          </label>

          <label>
            <span className={styles.srOnly}>
              Filtrar por estado
            </span>
            <select
              onChange={(event) =>
                setStatus(
                  event.target.value as
                    | ProspectStatus
                    | "ALL",
                )
              }
              value={status}
            >
              <option value="ALL">
                Todos los estados
              </option>
              {prospectStatuses.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {getProspectStatusLabel(
                      item,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        {filteredProspects.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>
              No hay prospectos para mostrar
            </strong>
            <p>
              Ajusta los filtros o agrega una nueva oportunidad comercial.
            </p>
          </div>
        ) : (
          <div className={styles.prospectGrid}>
            {filteredProspects.map(
              (prospect) => {
                const {
                  id,
                  metadata,
                } = prospect;
                const messages =
                  buildProspectMessages(
                    metadata,
                  );
                const whatsapp =
                  whatsappUrl(
                    metadata.phone,
                    messages.whatsapp,
                  );
                const mail = emailUrl(
                  metadata.email,
                  messages.emailSubject,
                  messages.emailBody,
                );
                const emailCopy = `Asunto: ${messages.emailSubject}\n\n${messages.emailBody}`;

                return (
                  <article
                    className={styles.prospectCard}
                    key={id}
                  >
                    <div
                      className={
                        styles.cardHeading
                      }
                    >
                      <div>
                        <span
                          className={`${styles.statusBadge} ${styles[`status${metadata.status}`]}`}
                        >
                          {getProspectStatusLabel(
                            metadata.status,
                          )}
                        </span>
                        <h3>
                          {metadata.company}
                        </h3>
                        <p>
                          {metadata.contactName ||
                            "Contacto por definir"}
                        </p>
                      </div>

                      <button
                        className={
                          styles.editButton
                        }
                        onClick={() => {
                          setEditing(
                            prospect,
                          );
                          window.scrollTo({
                            top: 0,
                            behavior:
                              "smooth",
                          });
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                    </div>

                    <dl
                      className={
                        styles.cardDetails
                      }
                    >
                      <div>
                        <dt>Interés</dt>
                        <dd>
                          {metadata.interest ||
                            "Por definir"}
                        </dd>
                      </div>
                      <div>
                        <dt>Industria</dt>
                        <dd>
                          {metadata.industry ||
                            "Sin clasificar"}
                        </dd>
                      </div>
                      <div>
                        <dt>Responsable</dt>
                        <dd>
                          {metadata.assignedTo ||
                            "Equipo"}
                        </dd>
                      </div>
                    </dl>

                    <div
                      className={`${styles.followUpDate} ${dateTone(metadata.nextFollowUp)}`}
                    >
                      <span>
                        Próximo seguimiento
                      </span>
                      <strong>
                        {formatDate(
                          metadata.nextFollowUp,
                        )}
                      </strong>
                    </div>

                    {metadata.notes && (
                      <p
                        className={
                          styles.cardNotes
                        }
                      >
                        {metadata.notes}
                      </p>
                    )}

                    <details
                      className={
                        styles.messageSuggestion
                      }
                    >
                      <summary>
                        2 mensajes sugeridos
                      </summary>

                      <div className={styles.messageVariant}>
                        <div className={styles.messageMeta}>
                          <strong>WhatsApp</strong>
                          <span>Breve y conversacional</span>
                        </div>

                        <p>{messages.whatsapp}</p>

                        <div className={styles.messageActions}>
                          <button
                            onClick={() =>
                              copyMessage(
                                `${id}-whatsapp`,
                                messages.whatsapp,
                              )
                            }
                            type="button"
                          >
                            {copiedId === `${id}-whatsapp`
                              ? "Copiado"
                              : "Copiar texto"}
                          </button>

                          {whatsapp && (
                            <a
                              href={whatsapp}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir WhatsApp
                            </a>
                          )}
                        </div>
                      </div>

                      <div className={styles.messageVariant}>
                        <div className={styles.messageMeta}>
                          <strong>Correo</strong>
                          <span>{messages.emailSubject}</span>
                        </div>

                        <p>{messages.emailBody}</p>

                        <div className={styles.messageActions}>
                          <button
                            onClick={() =>
                              copyMessage(
                                `${id}-email`,
                                emailCopy,
                              )
                            }
                            type="button"
                          >
                            {copiedId === `${id}-email`
                              ? "Copiado"
                              : "Copiar correo"}
                          </button>

                          {mail && (
                            <a href={mail}>
                              Abrir correo
                            </a>
                          )}
                        </div>
                      </div>
                    </details>

                    <footer
                      className={
                        styles.cardFooter
                      }
                    >
                      <span>
                        {metadata.email ||
                          metadata.phone ||
                          metadata.source ||
                          "Sin datos de contacto"}
                      </span>

                      <form
                        action={
                          deleteProspect
                        }
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `¿Eliminar ${metadata.company} del seguimiento?`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input
                          name="id"
                          type="hidden"
                          value={id}
                        />
                        <button
                          type="submit"
                        >
                          Eliminar
                        </button>
                      </form>
                    </footer>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    </>
  );
}
