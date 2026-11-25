"use client";

import { useDeferredValue, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import {
  buildHostingEmail,
  hasUnfilledHostingFields,
  HOSTING_EMAIL_ADDRESS,
  HOSTING_EMAIL_BODY_LIMIT,
  HOSTING_EMAIL_SENDER,
  HOSTING_EMAIL_SUBJECT_LIMIT,
  hostingEmailTemplates,
  isHostingEmailTemplate,
  type HostingEmailTemplate,
} from "@/lib/hosting-email";
import { sendHostingEmail, type HostingSendResult } from "./actions";
import styles from "./correos.module.css";

type ClientOption = { id: string; name: string; email: string; contactName: string };

export default function HostingEmailComposer({
  clients,
  initialClient,
}: {
  clients: ClientOption[];
  initialClient?: ClientOption;
}) {
  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [recipient, setRecipient] = useState(initialClient?.email ?? "");
  const [template, setTemplate] = useState<HostingEmailTemplate>("libre");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<HostingSendResult | null>(null);
  const [sending, startSending] = useTransition();
  const sendId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewSubject = useDeferredValue(subject);
  const previewMessage = useDeferredValue(message);
  const hasUnfilledFields = hasUnfilledHostingFields(message);
  const previewHtml = useMemo(() => buildHostingEmail({
    subject: previewSubject.trim() || "Asunto del correo",
    message: previewMessage.trim() || "El mensaje aparecerá aquí mientras escribes.",
  }).html, [previewMessage, previewSubject]);

  function changeTemplate(value: string) {
    if (!isHostingEmailTemplate(value) || value === template) return;
    if ((subject.trim() || message.trim()) && !window.confirm("¿Reemplazar el asunto y el mensaje con esta plantilla?")) return;

    const next = hostingEmailTemplates[value];
    const contact = clients.find((client) => client.id === clientId)?.contactName.trim();
    setTemplate(value);
    setSubject(next.subject);
    setMessage(next.body ? `${contact ? `Hola, ${contact}:` : "Hola:"}\n\n${next.body}` : "");
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasUnfilledFields || sending) return;
    dialog.current?.showModal();
  }

  function send() {
    if (!form.current || sending) return;
    const data = new FormData(form.current);
    sendId.current ??= window.crypto.randomUUID();
    data.set("sendId", sendId.current);

    startSending(async () => {
      try {
        const result = await sendHostingEmail(data);
        setFeedback(result);
        if (result.status === "sent") {
          sendId.current = null;
          setSubject("");
          setMessage("");
          setTemplate("libre");
        } else if (result.retryable) {
          sendId.current = null;
        }
      } catch {
        setFeedback({ status: "pending", message: "El estado del envío está por confirmar. Revisa el historial antes de repetirlo." });
      } finally {
        dialog.current?.close();
      }
    });
  }

  return (
    <>
      <div aria-live="polite">
        {feedback ? (
          <p className={styles.feedback} data-status={feedback.status}>{feedback.message}</p>
        ) : null}
      </div>
      <div className={styles.workspace}>
        <form className={styles.composer} onSubmit={review} ref={form}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Redactar correo</h2>
              <p>{HOSTING_EMAIL_SENDER} &lt;{HOSTING_EMAIL_ADDRESS}&gt;</p>
            </div>
          </div>

          <div className={styles.fields}>
            <div className={styles.pairedFields}>
              <label>
                <span>Cliente <small>Opcional</small></span>
                <select name="clientId" value={clientId} onChange={(event) => {
                  const id = event.target.value;
                  setClientId(id);
                  setRecipient(clients.find((client) => client.id === id)?.email ?? "");
                }}>
                  <option value="">Sin vincular a una ficha</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
              <label>
                <span>Para</span>
                <input autoComplete="off" maxLength={254} name="recipient" onChange={(event) => setRecipient(event.target.value)} placeholder="nombre@empresa.cl" required type="email" value={recipient} />
              </label>
            </div>
            <label>
              <span>Plantilla</span>
              <select name="template" onChange={(event) => changeTemplate(event.target.value)} value={template}>
                {Object.entries(hostingEmailTemplates).map(([key, option]) => (
                  <option key={key} value={key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Asunto</span>
              <input maxLength={HOSTING_EMAIL_SUBJECT_LIMIT} name="subject" onChange={(event) => setSubject(event.target.value)} required value={subject} />
            </label>
            <label>
              <span id="hosting-message-label">Mensaje</span>
              <textarea aria-describedby="hosting-message-hint" aria-labelledby="hosting-message-label" maxLength={HOSTING_EMAIL_BODY_LIMIT} name="message" onChange={(event) => setMessage(event.target.value)} placeholder="Escribe el mensaje para el destinatario…" required rows={8} value={message} />
            </label>
            <small id="hosting-message-hint" className={hasUnfilledFields ? styles.incomplete : styles.fieldHint}>
              {hasUnfilledFields ? "Reemplaza los campos entre corchetes para enviar." : "La firma de Hosting Vialoop se agrega automáticamente."}
            </small>
          </div>

          <div className={styles.formFooter}>
            <button className={styles.primaryButton} disabled={hasUnfilledFields || sending} type="submit">Revisar envío</button>
          </div>
        </form>

        <section aria-labelledby="hosting-preview-title" className={styles.preview}>
          <div className={styles.panelHeader}>
            <div>
              <h2 id="hosting-preview-title">Vista previa</h2>
              <p>Para {recipient.trim() || "el destinatario"}</p>
            </div>
          </div>
          <iframe className={styles.previewFrame} sandbox="" srcDoc={previewHtml} tabIndex={0} title="Vista previa del correo de Hosting Vialoop" />
        </section>
      </div>

      <dialog aria-labelledby="hosting-send-title" className={styles.dialog} onCancel={(event) => {
        if (sending) event.preventDefault();
      }} ref={dialog}>
        <div className={styles.dialogContent}>
          <h2 id="hosting-send-title">Confirmar envío</h2>
          <dl>
            <div><dt>De</dt><dd>{HOSTING_EMAIL_ADDRESS}</dd></div>
            <div><dt>Para</dt><dd>{recipient.trim()}</dd></div>
            <div><dt>Asunto</dt><dd>{subject.trim()}</dd></div>
          </dl>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={sending} onClick={() => dialog.current?.close()} type="button">Seguir editando</button>
            <button className={styles.primaryButton} disabled={sending} onClick={send} type="button">{sending ? "Enviando…" : "Enviar correo"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
