"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { markRenewalAsNotified } from "./actions";
import styles from "./renovaciones.module.css";

type ReminderType =
  | "FIRST_NOTICE"
  | "SECOND_NOTICE"
  | "FINAL_NOTICE"
  | "OVERDUE_NOTICE"
  | "MANUAL";

type NotificationHistoryItem = {
  id: string;
  type: ReminderType;
  label: string;
  recipient: string;
  subject: string;
  sentAt: string;
};

type RenewalEmailComposerProps = {
  renewalId: string;
  clientName: string;
  mainContactName: string;
  recipient: string;
  serviceName: string;
  description: string;
  domain: string;
  dueDate: string;
  amount: string;
  reminderLabel: string;
  reminderType: ReminderType;
  alreadyNotified: boolean;
  sentToday: boolean;
  notificationHistory: NotificationHistoryItem[];
};

function SubmitButton({
  sentToday,
}: {
  sentToday: boolean;
}) {
  const { pending } =
    useFormStatus();

  return (
    <button
      className={
        styles.confirmSentButton
      }
      disabled={pending || sentToday}
      type="submit"
    >
      {pending
        ? "Registrando..."
        : sentToday
          ? "Aviso ya registrado hoy"
          : "Marcar como enviado"}
    </button>
  );
}

function isValidEmail(
  value: string,
) {
  const normalizedValue =
    value.trim();

  return (
    normalizedValue.includes("@") &&
    normalizedValue.includes(".")
  );
}

function getGreeting(
  mainContactName: string,
) {
  const normalizedName =
    mainContactName.trim();

  if (normalizedName) {
    return `A la atención de ${normalizedName}:`;
  }

  return "Estimados,";
}

function getEmailSubject({
  reminderType,
  serviceName,
  domain,
}: {
  reminderType: ReminderType;
  serviceName: string;
  domain: string;
}) {
  const normalizedService =
    serviceName.toLowerCase();

  const subjects: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      `Aviso de renovación de ${normalizedService} · ${domain}`,
    SECOND_NOTICE:
      `Segundo aviso: renovación de ${normalizedService} · ${domain}`,
    FINAL_NOTICE:
      `Recordatorio final: renovación de ${normalizedService} · ${domain}`,
    OVERDUE_NOTICE:
      `Servicio vencido: renovación de ${normalizedService} · ${domain}`,
    MANUAL:
      `Renovación de ${normalizedService} · ${domain}`,
  };

  return subjects[reminderType];
}

function getIntroduction(
  reminderType: ReminderType,
) {
  const introductions: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      "Junto con saludar, informamos la próxima renovación del siguiente servicio administrado por Vialoop:",
    SECOND_NOTICE:
      "Junto con saludar, nos ponemos nuevamente en contacto para recordar la próxima renovación del siguiente servicio administrado por Vialoop:",
    FINAL_NOTICE:
      "Junto con saludar, enviamos este recordatorio final respecto de la próxima renovación del siguiente servicio administrado por Vialoop:",
    OVERDUE_NOTICE:
      "Junto con saludar, informamos que el siguiente servicio administrado por Vialoop ha superado su fecha de vencimiento y requiere regularización:",
    MANUAL:
      "Junto con saludar, informamos la renovación del siguiente servicio administrado por Vialoop:",
  };

  return introductions[reminderType];
}

function getClosingParagraph(
  reminderType: ReminderType,
) {
  if (
    reminderType ===
    "OVERDUE_NOTICE"
  ) {
    return "Para evitar la suspensión o interrupción del servicio, agradeceremos regularizar el pago a la brevedad.";
  }

  if (
    reminderType ===
    "FINAL_NOTICE"
  ) {
    return "Para mantener la continuidad del servicio y evitar interrupciones, agradeceremos gestionar el pago antes de la fecha indicada.";
  }

  return "Para mantener la continuidad del servicio, agradeceremos gestionar el pago antes de la fecha indicada.";
}

function getEmailBody({
  mainContactName,
  description,
  domain,
  dueDate,
  amount,
  reminderType,
}: {
  mainContactName: string;
  description: string;
  domain: string;
  dueDate: string;
  amount: string;
  reminderType: ReminderType;
}) {
  return [
    getGreeting(mainContactName),
    "",
    getIntroduction(reminderType),
    "",
    `Servicio: ${description}`,
    `Dominio o proyecto: ${domain}`,
    `Fecha de vencimiento: ${dueDate}`,
    `Monto total con IVA: ${amount}`,
    "",
    getClosingParagraph(
      reminderType,
    ),
    "",
    "Una vez realizado el pago, favor responder este correo adjuntando el comprobante correspondiente.",
    "",
    "Saludos cordiales,",
    "",
    "Equipo Vialoop",
    "Agencia Publicitaria Vialoop SpA",
    "contacto@vialoop.cl",
    "www.vialoop.cl",
  ].join("\n");
}

export default function RenewalEmailComposer({
  renewalId,
  clientName,
  mainContactName,
  recipient: initialRecipient,
  serviceName,
  description,
  domain,
  dueDate,
  amount,
  reminderLabel,
  reminderType,
  alreadyNotified,
  sentToday,
  notificationHistory,
}: RenewalEmailComposerProps) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [recipient, setRecipient] =
    useState(initialRecipient);

  const [copied, setCopied] =
    useState(false);

  const defaultSubject =
    getEmailSubject({
      reminderType,
      serviceName,
      domain,
    });

  const defaultBody =
    getEmailBody({
      mainContactName,
      description,
      domain,
      dueDate,
      amount,
      reminderType,
    });

  const [subject, setSubject] =
    useState(defaultSubject);

  const [body, setBody] =
    useState(defaultBody);

  const action =
    markRenewalAsNotified.bind(
      null,
      renewalId,
    );

  const mailtoLink =
    useMemo(() => {
      const params =
        new URLSearchParams({
          subject,
          body,
        });

      return `mailto:${encodeURIComponent(
        recipient.trim(),
      )}?${params.toString()}`;
    }, [
      recipient,
      subject,
      body,
    ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape"
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.body.style.overflow =
        "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setRecipient(
      initialRecipient,
    );

    setSubject(
      defaultSubject,
    );

    setBody(defaultBody);
    setCopied(false);
  }, [
    isOpen,
    initialRecipient,
    defaultSubject,
    defaultBody,
  ]);

  async function copyEmail() {
    const content = [
      `Para: ${recipient.trim()}`,
      `Asunto: ${subject.trim()}`,
      "",
      body.trim(),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(
        content,
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2200);
    } catch {
      setCopied(false);
    }
  }

  function openEmailClient() {
    if (
      !isValidEmail(recipient)
    ) {
      return;
    }

    window.location.href =
      mailtoLink;
  }

  function closeModal() {
    setIsOpen(false);
    setCopied(false);
  }

  return (
    <>
      <button
        className={
          styles.emailAction
        }
        onClick={() =>
          setIsOpen(true)
        }
        type="button"
      >
        {sentToday
          ? "Aviso enviado hoy"
          : alreadyNotified
            ? "Preparar reenvío"
            : "Preparar correo"}
      </button>

      {isOpen && (
        <div
          className={
            styles.modalBackdrop
          }
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
          role="presentation"
        >
          <section
            aria-labelledby="renewal-email-title"
            aria-modal="true"
            className={
              styles.modal
            }
            role="dialog"
          >
            <header
              className={
                styles.modalHeader
              }
            >
              <div>
                <span
                  className={
                    styles.modalEyebrow
                  }
                >
                  Recordatorio de renovación
                </span>

                <h2 id="renewal-email-title">
                  Preparar correo de renovación
                </h2>
              </div>

              <button
                aria-label="Cerrar formulario"
                className={
                  styles.modalClose
                }
                onClick={
                  closeModal
                }
                type="button"
              >
                ×
              </button>
            </header>

            <p
              className={
                styles.modalIntro
              }
            >
              Revisa el destinatario,
              el asunto y el contenido.
              Después de enviar el
              mensaje, registra el
              aviso para conservar el
              historial.
            </p>

            <div
              className={
                styles.emailSummary
              }
            >
              <div>
                <span>Cliente</span>

                <strong>
                  {clientName}
                </strong>
              </div>

              <div>
                <span>
                  Contacto
                </span>

                <strong>
                  {mainContactName ||
                    "Sin contacto registrado"}
                </strong>
              </div>

              <div>
                <span>
                  Servicio
                </span>

                <strong>
                  {description}
                </strong>
              </div>

              <div>
                <span>
                  Vencimiento
                </span>

                <strong>
                  {dueDate}
                </strong>
              </div>

              <div>
                <span>
                  Monto con IVA
                </span>

                <strong>
                  {amount}
                </strong>
              </div>

              <div>
                <span>
                  Avisos registrados
                </span>

                <strong>
                  {
                    notificationHistory.length
                  }
                </strong>
              </div>
            </div>

            <div
              className={
                styles.reminderNotice
              }
            >
              <span>
                Acción recomendada
              </span>

              <strong>
                {reminderLabel}
              </strong>
            </div>

            {sentToday && (
              <div
                className={
                  styles.todayNotice
                }
              >
                Este tipo de aviso ya
                fue registrado hoy. El
                portal impedirá
                registrarlo nuevamente.
              </div>
            )}

            <form
              action={action}
              className={
                styles.emailForm
              }
            >
              <input
                name="reminderType"
                type="hidden"
                value={
                  reminderType
                }
              />

              <label
                className={
                  styles.field
                }
              >
                <span>
                  Correo del destinatario
                </span>

                <input
                  autoComplete="email"
                  name="recipient"
                  onChange={(
                    event,
                  ) => {
                    setRecipient(
                      event.target
                        .value,
                    );
                  }}
                  placeholder="contacto@empresa.cl"
                  required
                  type="email"
                  value={recipient}
                />
              </label>

              <label
                className={
                  styles.field
                }
              >
                <span>
                  Asunto
                </span>

                <input
                  name="subject"
                  onChange={(
                    event,
                  ) => {
                    setSubject(
                      event.target
                        .value,
                    );
                  }}
                  required
                  type="text"
                  value={subject}
                />
              </label>

              <label
                className={
                  styles.field
                }
              >
                <span>
                  Contenido del correo
                </span>

                <textarea
                  name="body"
                  onChange={(
                    event,
                  ) => {
                    setBody(
                      event.target
                        .value,
                    );
                  }}
                  required
                  rows={17}
                  value={body}
                />
              </label>

              <div
                className={
                  styles.emailTools
                }
              >
                <button
                  className={
                    styles.copyButton
                  }
                  onClick={
                    copyEmail
                  }
                  type="button"
                >
                  {copied
                    ? "Correo copiado"
                    : "Copiar correo"}
                </button>

                <button
                  className={
                    styles.openMailButton
                  }
                  disabled={
                    !isValidEmail(
                      recipient,
                    )
                  }
                  onClick={
                    openEmailClient
                  }
                  type="button"
                >
                  Abrir en correo
                </button>
              </div>

              <div
                className={
                  styles.manualNotice
                }
              >
                <strong>
                  Confirmación manual
                </strong>

                <p>
                  Abrir el mensaje en
                  Gmail u Outlook no
                  confirma el envío.
                  Después de enviarlo,
                  vuelve al portal y
                  selecciona “Marcar
                  como enviado”.
                </p>
              </div>

              {notificationHistory.length >
                0 && (
                <section
                  className={
                    styles.historyPanel
                  }
                >
                  <div
                    className={
                      styles.historyHeader
                    }
                  >
                    <div>
                      <span>
                        Historial
                      </span>

                      <h3>
                        Avisos anteriores
                      </h3>
                    </div>

                    <strong>
                      {
                        notificationHistory.length
                      }
                    </strong>
                  </div>

                  <div
                    className={
                      styles.historyList
                    }
                  >
                    {notificationHistory.map(
                      (
                        notification,
                      ) => (
                        <article
                          className={
                            styles.historyItem
                          }
                          key={
                            notification.id
                          }
                        >
                          <div>
                            <strong>
                              {
                                notification.label
                              }
                            </strong>

                            <span>
                              {
                                notification.sentAt
                              }
                            </span>
                          </div>

                          <div>
                            <span>
                              {
                                notification.recipient
                              }
                            </span>

                            <small>
                              {
                                notification.subject
                              }
                            </small>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </section>
              )}

              <footer
                className={
                  styles.modalFooter
                }
              >
                <button
                  className={
                    styles.cancelModalButton
                  }
                  onClick={
                    closeModal
                  }
                  type="button"
                >
                  Cerrar
                </button>

                <SubmitButton
                  sentToday={
                    sentToday
                  }
                />
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}