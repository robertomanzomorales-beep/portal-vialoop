import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hostingEmailTemplates, isHostingEmailTemplate } from "@/lib/hosting-email";
import { prisma } from "@/lib/prisma";
import HostingEmailComposer from "./HostingEmailComposer";
import styles from "./correos.module.css";

export const metadata: Metadata = { title: "Correos de hosting" };

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

const statusLabels = {
  HOSTING_EMAIL_STARTED: "Por verificar",
  HOSTING_EMAIL_SENT: "Enviado",
  HOSTING_EMAIL_FAILED: "No enviado",
} as const;

export default async function HostingEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await requireUser();
  const { cliente: clientId } = await searchParams;
  const [records, logs] = await Promise.all([
    prisma.client.findMany({
      where: {
        OR: [{ status: "ACTIVE" }, ...(clientId ? [{ id: clientId }] : [])],
      },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, tradeName: true, email: true, mainContactName: true },
    }),
    prisma.activityLog.findMany({
      where: { entityType: "HostingEmail", ...(clientId ? { clientId } : {}) },
      select: {
        id: true,
        createdAt: true,
        action: true,
        description: true,
        metadata: true,
        client: { select: { id: true, businessName: true, tradeName: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const clients = records.map((record) => ({
    id: record.id,
    name: record.tradeName || record.businessName,
    email: record.email ?? "",
    contactName: record.mainContactName ?? "",
  }));
  const selectedClient = clients.find((client) => client.id === clientId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Correos de hosting</h1>
          <p>Envía novedades de servicio, avisos o respuestas de soporte desde el correo de Hosting.</p>
        </div>
        <a className={styles.textLink} href="#historial">Ver historial</a>
      </header>

      <HostingEmailComposer key={selectedClient?.id ?? "nuevo"} clients={clients} initialClient={selectedClient} />

      <section aria-labelledby="hosting-history-title" className={styles.history} id="historial">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="hosting-history-title">Historial de envíos</h2>
            <p>{selectedClient ? selectedClient.name : "Últimos 30 envíos de esta sección"}</p>
          </div>
          {clientId ? <Link className={styles.textLink} href="/hosting/correos#historial">Ver todos</Link> : null}
        </div>
        {logs.length ? (
          <ul className={styles.historyList}>
            {logs.map((log) => {
              const details = log.metadata as { recipient?: string; template?: string } | null;
              const template = details?.template;
              const status = statusLabels[log.action as keyof typeof statusLabels] ?? "Por verificar";
              return (
                <li className={styles.historyRow} key={log.id}>
                  <div className={styles.historyMessage}>
                    <strong>{log.description}</strong>
                    <span>{details?.recipient}</span>
                  </div>
                  <div className={styles.historyContext}>
                    {log.client ? (
                      <Link href={`/clientes/${log.client.id}`}>{log.client.tradeName || log.client.businessName}</Link>
                    ) : null}
                    <span>{template && isHostingEmailTemplate(template) ? hostingEmailTemplates[template].label : "Correo de hosting"}</span>
                  </div>
                  <div className={styles.historyDate}>
                    <time dateTime={log.createdAt.toISOString()}>{dateFormat.format(log.createdAt)}</time>
                    {log.user?.name ? <span>{log.user.name}</span> : null}
                  </div>
                  <span className={`${styles.status} ${status === "Enviado" ? styles.sent : status === "No enviado" ? styles.failed : styles.pending}`}>{status}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className={styles.empty}>Todavía no hay envíos registrados{selectedClient ? " para este cliente" : ""}.</p>}
      </section>
    </main>
  );
}
