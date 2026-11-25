"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import {
  buildHostingEmail,
  hasUnfilledHostingFields,
  HOSTING_EMAIL_ADDRESS,
  HOSTING_EMAIL_BODY_LIMIT,
  HOSTING_EMAIL_SENDER,
  HOSTING_EMAIL_SUBJECT_LIMIT,
  isHostingEmailTemplate,
} from "@/lib/hosting-email";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export type HostingSendResult = {
  status: "sent" | "failed" | "pending";
  message: string;
  retryable?: boolean;
};

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const sent = (recipient: string): HostingSendResult => ({
  status: "sent",
  message: `Correo enviado a ${recipient}.`,
});

const failed = (message: string, retryable = true): HostingSendResult => ({
  status: "failed",
  message,
  retryable,
});

const pending: HostingSendResult = {
  status: "pending",
  message: "El envío ya está registrado y su estado aún está por confirmar. Revisa el historial antes de repetirlo.",
};

export async function sendHostingEmail(data: FormData): Promise<HostingSendResult> {
  const user = await requireUser();
  const id = field(data, "sendId");
  const clientId = field(data, "clientId");
  const recipient = field(data, "recipient");
  const subject = field(data, "subject");
  const message = field(data, "message");
  const template = field(data, "template");

  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id) || !isHostingEmailTemplate(template)) {
    return failed("No pudimos preparar el envío. Vuelve a intentarlo.");
  }

  if (recipient.length > 254 || !/^[^\s@<>,;:"\\]+@[\w.-]+\.[a-z]{2,}$/i.test(recipient)) {
    return failed("Ingresa una única dirección de correo válida.");
  }

  if (!subject || subject.length > HOSTING_EMAIL_SUBJECT_LIMIT || /[\r\n]/.test(subject)) {
    return failed("Revisa el asunto del correo.");
  }

  if (!message || message.length > HOSTING_EMAIL_BODY_LIMIT || hasUnfilledHostingFields(message)) {
    return failed("Completa el mensaje y reemplaza los campos de la plantilla antes de enviar.");
  }

  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return failed("El cliente ya no existe. Actualiza la selección.");
  }

  const metadata = { recipient, subject, template };

  try {
    await prisma.activityLog.create({
      data: {
        id,
        userId: user.id,
        clientId: clientId || null,
        entityType: "HostingEmail",
        entityId: id,
        action: "HOSTING_EMAIL_STARTED",
        description: subject,
        metadata,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;

    const previous = await prisma.activityLog.findFirst({
      where: { id, userId: user.id, entityType: "HostingEmail" },
      select: { action: true, metadata: true },
    });
    if (previous?.action === "HOSTING_EMAIL_SENT") {
      const values = previous.metadata as { recipient?: string } | null;
      return sent(values?.recipient ?? recipient);
    }
    if (previous?.action === "HOSTING_EMAIL_FAILED") {
      return failed("El envío anterior no se completó. Puedes volver a intentarlo.");
    }
    return pending;
  }

  let smtpMessageId: string;
  try {
    const result = await sendEmail({
      ...buildHostingEmail({ subject, message }),
      to: recipient,
      subject,
      fromName: HOSTING_EMAIL_SENDER,
      fromEmail: HOSTING_EMAIL_ADDRESS,
      replyTo: HOSTING_EMAIL_ADDRESS,
      mailAccount: "default",
    });
    if (result.accepted.length === 0) throw new Error("El destinatario no fue aceptado.");
    smtpMessageId = result.messageId;
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number } | null;
    const code = failure?.code;
    const responseCode = failure?.responseCode ?? 0;
    const wasRejected =
      !code ||
      (responseCode >= 400 && responseCode < 600) ||
      ["EAUTH", "EDNS", "EENVELOPE", "ETLS"].includes(code);
    console.error("Envío de Hosting sin confirmación", { id, code });

    if (wasRejected) {
      await prisma.activityLog.update({
        where: { id },
        data: { action: "HOSTING_EMAIL_FAILED" },
      });
    }
    revalidatePath("/hosting/correos");
    return wasRejected
      ? failed("No se pudo enviar el correo. Revisa la dirección de destino o vuelve a intentarlo.")
      : pending;
  }

  try {
    await prisma.activityLog.update({
      where: { id },
      data: { action: "HOSTING_EMAIL_SENT", metadata: { ...metadata, smtpMessageId } },
    });
  } catch {
    console.error("Correo aceptado por SMTP con historial pendiente", { id });
    revalidatePath("/hosting/correos");
    return { status: "sent", message: "El servidor aceptó el correo. El estado del historial quedó por verificar." };
  }

  revalidatePath("/hosting/correos");
  return sent(recipient);
}
