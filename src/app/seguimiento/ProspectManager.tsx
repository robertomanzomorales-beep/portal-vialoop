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

function formatCurrency(value: number) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function chileDateKey() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    },
  ).format(new Date());
}

function dateTone(dateKey: string) {
  if (!dateKey) {
    return styles.dateNeutral;
  }

  const today = chileDateKey();

  if (dateKey < today) {
    return styles.dateOverdue;
  }

  if (dateKey === today) {
    return styles.dateToday;
  }

  return styles.dateUpcoming;
}

function quotationValidity(
  validUntil: string,
) {
  if (!validUntil) {
    return {
      label: "Sin vigencia informada",
      tone: styles.quotationNeutral,
    };
  }

  const today = chileDateKey();
  const difference = Math.round(
    (new Date(
      `${validUntil}T12:00:00Z`,
    ).getTime() -
      new Date(
        `${today}T12:00:00Z`,
      ).getTime()) /
      86_400_000,
  );

  if (difference < 0) {
    const days = Math.abs(difference);

    return {
      label:
        days === 1
          ? "Venció hace 1 día"
          : `Venció hace ${days} días`,
      tone: styles.quotationExpired,
    };
  }

  if (difference === 0) {
    return {
      label: "Vence hoy",
      tone: styles.quotationToday,
    };
  }

  return {
    label:
      difference === 1
        ? "Vence mañana"
        : `Vence en ${difference} días`,
    tone:
      difference <= 3
        ? styles.quotationSoon
        : styles.quotationActive,
  };
}

function whatsappUrl(
  phone: string,
  message: string,
) {
  const digits = phone.replace(/\D/g, "");

  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : "";
}

function emailUrl(
  email: string,
  subject: string,
  message: string,
) {
  return email
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    : "";
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
  const [editorOpen, setEditorOpen] =
    useState(false);
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
  const [deletingId, setDeletingId] =
    useState<string | null>(null);
  const [removedIds, setRemovedIds] =
    useState<string[]>([]);
  const [deleteFeedback, setDeleteFeedback] =
    useState<{
      ok: boolean;
      message: string;
    } | null>(null);

  const filteredProspects = useMemo(() => {
    const normalizedQuery = normalize(
      query.trim(),
    );

    return prospects.filter(
      ({ id, metadata }) => {
        if (removedIds.includes(id)) {
          return false;
        }

        if (
          status !== "ALL" &&
          metadata.status !== status
        ) {
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
            ...metadata.quotations.flatMap(
              (quotation) => [
                quotation.number,
                quotation.projectName,
                ...quotation.items.map(
                  (item) =>
                    item.description,
                ),
              ],
            ),
          ].join(" "),
        );

        return haystack.includes(
          normalizedQuery,
        );
      },
    );
  }, [prospects, query, removedIds, status]);

  const openEditor = (
    prospect: ProspectRecord | null,
  ) => {
    setEditing(prospect);
    setEditorOpen(true);
    setFormVersion(
      (current) => current + 1,
    );
    window.setTimeout(() => {
      document
        .getElementById("prospect-editor")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 20);
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

  const removeProspect = async (
    prospect: ProspectRecord,
  ) => {
    const confirmed = window.confirm(
      `¿Eliminar ${prospect.metadata.company} del seguimiento?\n\nLa cotización seguirá guardada en Cotizaciones, pero esta oportunidad dejará de aparecer y no se volverá a crear automáticamente.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(prospect.id);
    setDeleteFeedback(null);

    try {
      const result =
        await deleteProspect(prospect.id);
      setDeleteFeedback(result);

      if (result.ok) {
        setRemovedIds((current) => [
          ...current,
          prospect.id,
        ]);

        if (editing?.id === prospect.id) {
          setEditing(null);
          setEditorOpen(false);
        }
      }
    } catch {
      setDeleteFeedback({
        ok: false,
        message:
          "No fue posible eliminar la oportunidad. Intenta nuevamente.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={styles.pipelinePanel}>
      <div className={styles.pipelineHeader}>
        <div>
          <span className={styles.eyebrow}>
            Pipeline comercial
          </span>
          <h2>Oportunidades en seguimiento</h2>
          <p>
            Listado compacto para gestionar cada oportunidad sin perder el contexto de la cotización.
          </p>
        </div>

        <button
          className={styles.primaryButton}
          onClick={() => openEditor(null)}
          type="button"
        >
          + Nueva oportunidad
        </button>
      </div>

      {editorOpen && (
        <div
          className={styles.editorPanel}
          id="prospect-editor"
        >
          <div className={styles.editorHeader}>
            <div>
              <span className={styles.eyebrow}>
                {editing
                  ? "Editar oportunidad"
                  : "Nuevo registro"}
              </span>
              <h3>
                {editing
                  ? editing.metadata.company
                  : "Agregar prospecto"}
              </h3>
            </div>

            <button
              className={styles.ghostButton}
              onClick={() => {
                setEditing(null);
                setEditorOpen(false);
              }}
              type="button"
            >
              Cerrar
            </button>
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

            <label className={styles.wideField}>
              <span>Interés o servicio</span>
              <input
                defaultValue={
                  editing?.metadata.interest
                }
                name="interest"
                placeholder="Sitio web, software, hosting..."
              />
            </label>

            <label className={styles.wideField}>
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
                  role="status"
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
                    : "Agregar oportunidad"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.filters}>
        <label>
          <span className={styles.srOnly}>
            Buscar oportunidades
          </span>
          <input
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Buscar empresa, contacto, servicio o cotización"
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
            {prospectStatuses.map((item) => (
              <option
                key={item}
                value={item}
              >
                {getProspectStatusLabel(item)}
              </option>
            ))}
          </select>
        </label>

        <span className={styles.resultCount}>
          {filteredProspects.length} resultado
          {filteredProspects.length === 1
            ? ""
            : "s"}
        </span>
      </div>

      {deleteFeedback && (
        <p
          className={
            deleteFeedback.ok
              ? styles.feedbackSuccess
              : styles.feedbackError
          }
          role="status"
        >
          {deleteFeedback.message}
        </p>
      )}

      {filteredProspects.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>
            No hay oportunidades para mostrar
          </strong>
          <p>
            Ajusta los filtros o agrega una nueva oportunidad comercial.
          </p>
        </div>
      ) : (
        <div className={styles.prospectList}>
          {filteredProspects.map((prospect) => {
            const { id, metadata } = prospect;
            const messages =
              buildProspectMessages(metadata);
            const whatsapp = whatsappUrl(
              metadata.phone,
              messages.whatsapp,
            );
            const mail = emailUrl(
              metadata.email,
              messages.emailSubject,
              messages.emailBody,
            );
            const emailCopy = `Asunto: ${messages.emailSubject}\n\n${messages.emailBody}`;
            const latestQuotation =
              metadata.quotations[0];
            const validity = latestQuotation
              ? quotationValidity(
                  latestQuotation.validUntil,
                )
              : null;

            return (
              <article
                className={styles.prospectCard}
                id={`prospect-${id}`}
                key={id}
              >
                <div className={styles.recordHeader}>
                  <div className={styles.recordIdentity}>
                    <span
                      className={`${styles.statusBadge} ${styles[`status${metadata.status}`]}`}
                    >
                      {getProspectStatusLabel(
                        metadata.status,
                      )}
                    </span>
                    <div>
                      <h3>{metadata.company}</h3>
                      <p>
                        {metadata.contactName ||
                          "Contacto por definir"}
                      </p>
                    </div>
                  </div>

                  <div className={styles.recordService}>
                    <span>Interés</span>
                    <strong>
                      {metadata.interest ||
                        "Por definir"}
                    </strong>
                    <small>
                      {metadata.assignedTo || "Equipo"}
                    </small>
                  </div>

                  <div
                    className={`${styles.recordDate} ${dateTone(metadata.nextFollowUp)}`}
                  >
                    <span>Próximo contacto</span>
                    <strong>
                      {formatDate(
                        metadata.nextFollowUp,
                      )}
                    </strong>
                  </div>

                  <div className={styles.recordActions}>
                    <button
                      className={styles.editButton}
                      onClick={() =>
                        openEditor(prospect)
                      }
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className={styles.deleteButton}
                      disabled={deletingId === id}
                      onClick={() =>
                        removeProspect(prospect)
                      }
                      type="button"
                    >
                      {deletingId === id
                        ? "Eliminando..."
                        : "Eliminar"}
                    </button>
                  </div>
                </div>

                {latestQuotation && validity && (
                  <div className={styles.quotationSummary}>
                    <div>
                      <span>Cotización</span>
                      <strong>
                        {latestQuotation.number}
                      </strong>
                    </div>
                    <div>
                      <span>Proyecto</span>
                      <strong>
                        {latestQuotation.projectName ||
                          "Propuesta general"}
                      </strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>
                        {formatCurrency(
                          latestQuotation.totalAmount,
                        )}
                      </strong>
                    </div>
                    <span
                      className={`${styles.quotationValidity} ${validity.tone}`}
                    >
                      {validity.label}
                    </span>
                    <a
                      href={latestQuotation.pdfPath}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Ver PDF
                    </a>
                  </div>
                )}

                <details className={styles.recordDetails}>
                  <summary>
                    Ver contacto, notas y mensajes
                  </summary>

                  <div className={styles.detailGrid}>
                    <section className={styles.contactBlock}>
                      <span className={styles.detailLabel}>
                        Datos comerciales
                      </span>
                      <dl>
                        <div>
                          <dt>Correo</dt>
                          <dd>
                            {metadata.email || "Sin correo"}
                          </dd>
                        </div>
                        <div>
                          <dt>Teléfono</dt>
                          <dd>
                            {metadata.phone || "Sin teléfono"}
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
                          <dt>Origen</dt>
                          <dd>
                            {metadata.source ||
                              "Sin registrar"}
                          </dd>
                        </div>
                      </dl>

                      {metadata.notes && (
                        <p className={styles.notesBlock}>
                          {metadata.notes}
                        </p>
                      )}

                      {latestQuotation && (
                        <p className={styles.servicesBlock}>
                          <strong>
                            Servicios cotizados:
                          </strong>{" "}
                          {latestQuotation.items
                            .map(
                              (item) =>
                                `${item.description}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </section>

                    <section className={styles.messageBlock}>
                      <span className={styles.detailLabel}>
                        Mensaje para WhatsApp
                      </span>
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
                          {copiedId ===
                          `${id}-whatsapp`
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
                    </section>

                    <section className={styles.messageBlock}>
                      <span className={styles.detailLabel}>
                        Correo sugerido
                      </span>
                      <strong>
                        {messages.emailSubject}
                      </strong>
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
                    </section>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
