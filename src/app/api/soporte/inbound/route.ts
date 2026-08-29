import {
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSupportAcknowledgement } from "@/lib/support-email";

export const runtime = "nodejs";

type PostmarkAddress = {
  Email?: string;
  Name?: string;
};

type PostmarkHeader = {
  Name?: string;
  Value?: string;
};

type PostmarkAttachment = {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
};

type PostmarkInboundPayload = {
  From?: string;
  FromName?: string;
  FromFull?: PostmarkAddress;
  To?: string;
  OriginalRecipient?: string;
  Subject?: string;
  MessageID?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
};

const SUPPORT_EMAIL =
  process.env.SUPPORT_FROM_EMAIL?.trim().toLowerCase() ||
  "hosting@vialoop.cl";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthorized(request: NextRequest) {
  const configuredSecret =
    process.env.POSTMARK_INBOUND_SECRET?.trim();

  if (!configuredSecret) {
    throw new Error(
      "POSTMARK_INBOUND_SECRET no está configurada.",
    );
  }

  const headerSecret = request.headers
    .get("x-vialoop-inbound-secret")
    ?.trim();
  const querySecret = request.nextUrl.searchParams
    .get("secret")
    ?.trim();
  const providedSecret = headerSecret || querySecret || "";

  return safeEqual(providedSecret, configuredSecret);
}

function getHeader(
  headers: PostmarkHeader[] | undefined,
  name: string,
) {
  return headers
    ?.find(
      (header) =>
        header.Name?.toLowerCase() === name.toLowerCase(),
    )
    ?.Value?.trim();
}

function normalizeEmail(value: string | undefined) {
  if (!value) {
    return "";
  }

  const angleMatch = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = angleMatch?.[1] ?? value;
  const plainMatch = candidate.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );

  return plainMatch?.[0]?.trim().toLowerCase() ?? "";
}

function normalizeDomain(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");

  return normalized;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMessageBody(payload: PostmarkInboundPayload) {
  const rawBody =
    payload.StrippedTextReply?.trim() ||
    payload.TextBody?.trim() ||
    stripHtml(payload.HtmlBody ?? "") ||
    "El correo no contenía texto legible.";

  const body = rawBody.slice(0, 20_000);
  const attachments = (payload.Attachments ?? [])
    .map((attachment) => attachment.Name?.trim())
    .filter((name): name is string => Boolean(name));

  if (attachments.length === 0) {
    return body;
  }

  return `${body}\n\nAdjuntos conservados en el correo original: ${attachments.join(
    ", ",
  )}.`.slice(0, 22_000);
}

function getTicketNumber(subject: string) {
  const match = subject.match(
    /(?:\[|\b)(?:atenci[oó]n|solicitud)\s+#0*(\d+)(?:\]|\b)/i,
  );

  if (!match?.[1]) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function getReferencedMessageIds(
  headers: PostmarkHeader[] | undefined,
) {
  const rawReferences = [
    getHeader(headers, "In-Reply-To"),
    getHeader(headers, "References"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return Array.from(
    new Set(rawReferences.match(/<[^<>]+>/g) ?? []),
  ).slice(0, 30);
}

function isAutomatedMessage(payload: PostmarkInboundPayload) {
  const fromEmail = normalizeEmail(
    payload.FromFull?.Email || payload.From,
  );
  const autoSubmitted = getHeader(
    payload.Headers,
    "Auto-Submitted",
  )?.toLowerCase();
  const precedence = getHeader(
    payload.Headers,
    "Precedence",
  )?.toLowerCase();
  const subject = payload.Subject?.toLowerCase() ?? "";

  return (
    fromEmail === SUPPORT_EMAIL ||
    fromEmail.startsWith("mailer-daemon@") ||
    fromEmail.startsWith("postmaster@") ||
    (Boolean(autoSubmitted) && autoSubmitted !== "no") ||
    ["bulk", "junk", "list"].includes(precedence ?? "") ||
    subject.includes("delivery status notification") ||
    subject.includes("undeliverable") ||
    subject.includes("no se pudo entregar")
  );
}

function getStableProviderMessageId(
  payload: PostmarkInboundPayload,
) {
  if (payload.MessageID?.trim()) {
    return `postmark:${payload.MessageID.trim()}`;
  }

  const fingerprint = [
    payload.From,
    payload.To,
    payload.Date,
    payload.Subject,
    payload.TextBody,
  ].join("|");

  return `postmark-fallback:${createHash("sha256")
    .update(fingerprint)
    .digest("hex")}`;
}

async function findClientAndProject(fromEmail: string) {
  const directClient = await prisma.client.findFirst({
    where: {
      email: {
        equals: fromEmail,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
  });

  if (directClient) {
    return {
      clientId: directClient.id,
      projectId: null,
    };
  }

  const portalUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: fromEmail,
        mode: "insensitive",
      },
      clientId: {
        not: null,
      },
    },
    select: {
      clientId: true,
    },
  });

  if (portalUser?.clientId) {
    return {
      clientId: portalUser.clientId,
      projectId: null,
    };
  }

  const senderDomain = normalizeDomain(
    fromEmail.split("@")[1],
  );

  if (
    !senderDomain ||
    [
      "gmail.com",
      "hotmail.com",
      "outlook.com",
      "live.com",
      "yahoo.com",
      "icloud.com",
    ].includes(senderDomain)
  ) {
    return {
      clientId: null,
      projectId: null,
    };
  }

  const projects = await prisma.project.findMany({
    where: {
      domain: {
        not: null,
      },
    },
    select: {
      id: true,
      clientId: true,
      domain: true,
    },
  });

  const matchedProject = projects.find(
    (project) =>
      normalizeDomain(project.domain) === senderDomain,
  );

  return {
    clientId: matchedProject?.clientId ?? null,
    projectId: matchedProject?.id ?? null,
  };
}

async function sendPendingAcknowledgement(
  emailMessageId: string,
  requestNumber: number,
  requestSubject: string,
  requesterEmail: string,
  requesterName: string | null,
  internetMessageId: string | null,
) {
  try {
    const delivery = await sendSupportAcknowledgement({
      to: requesterEmail,
      recipientName: requesterName,
      requestNumber,
      requestSubject,
      originalMessageId: internetMessageId,
    });

    const outboundMessageId =
      typeof delivery.messageId === "string"
        ? delivery.messageId.trim()
        : "";

    await prisma.$transaction(async (transaction) => {
      await transaction.supportEmailMessage.update({
        where: {
          id: emailMessageId,
        },
        data: {
          automaticReplySentAt: new Date(),
          automaticReplyError: null,
        },
      });

      if (outboundMessageId) {
        const inboundMessage =
          await transaction.supportEmailMessage.findUnique({
            where: {
              id: emailMessageId,
            },
            select: {
              supportRequestId: true,
            },
          });

        if (inboundMessage) {
          await transaction.supportEmailMessage.upsert({
            where: {
              providerMessageId: `smtp:${outboundMessageId}`,
            },
            update: {},
            create: {
              supportRequestId:
                inboundMessage.supportRequestId,
              providerMessageId: `smtp:${outboundMessageId}`,
              internetMessageId: outboundMessageId,
              direction: "OUTBOUND",
              fromEmail: SUPPORT_EMAIL,
              toEmail: requesterEmail,
              subject: `[Atención #${requestNumber
                .toString()
                .padStart(4, "0")}] Solicitud recibida por Soporte Vialoop`,
              receivedAt: new Date(),
            },
          });
        }
      }
    });

    return "sent" as const;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No fue posible enviar la confirmación.";

    await prisma.supportEmailMessage.update({
      where: {
        id: emailMessageId,
      },
      data: {
        automaticReplyError: message.slice(0, 2_000),
      },
    });

    return "failed" as const;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 },
      );
    }

    const payload =
      (await request.json()) as PostmarkInboundPayload;

    if (isAutomatedMessage(payload)) {
      return NextResponse.json({ ignored: "automated" });
    }

    const fromEmail = normalizeEmail(
      payload.FromFull?.Email || payload.From,
    );

    if (!fromEmail) {
      return NextResponse.json(
        { error: "El correo no contiene un remitente válido." },
        { status: 400 },
      );
    }

    const providerMessageId =
      getStableProviderMessageId(payload);
    const internetMessageId =
      getHeader(payload.Headers, "Message-ID") ?? null;
    const requestSubject =
      payload.Subject?.trim().slice(0, 300) ||
      "Solicitud de soporte por correo";
    const requesterName =
      payload.FromFull?.Name?.trim().slice(0, 180) ||
      payload.FromName?.trim().slice(0, 180) ||
      null;

    const duplicate =
      await prisma.supportEmailMessage.findUnique({
        where: {
          providerMessageId,
        },
        include: {
          supportRequest: {
            select: {
              number: true,
              subject: true,
              requesterEmail: true,
              requesterName: true,
            },
          },
        },
      });

    if (duplicate) {
      let acknowledgement = "not-required";

      if (
        duplicate.automaticReplyRequired &&
        !duplicate.automaticReplySentAt &&
        duplicate.supportRequest.requesterEmail
      ) {
        acknowledgement =
          await sendPendingAcknowledgement(
            duplicate.id,
            duplicate.supportRequest.number,
            duplicate.supportRequest.subject,
            duplicate.supportRequest.requesterEmail,
            duplicate.supportRequest.requesterName,
            duplicate.internetMessageId,
          );
      }

      return NextResponse.json({
        accepted: true,
        duplicate: true,
        acknowledgement,
      });
    }

    const existingTicketNumber =
      getTicketNumber(requestSubject);

    const referencedMessageIds =
      getReferencedMessageIds(payload.Headers);

    let existingRequest = existingTicketNumber
      ? await prisma.supportRequest.findUnique({
          where: {
            number: existingTicketNumber,
          },
          select: {
            id: true,
            number: true,
            clientId: true,
            projectId: true,
            status: true,
          },
        })
      : null;

    if (!existingRequest && referencedMessageIds.length > 0) {
      const referencedEmail =
        await prisma.supportEmailMessage.findFirst({
          where: {
            internetMessageId: {
              in: referencedMessageIds,
            },
          },
          select: {
            supportRequest: {
              select: {
                id: true,
                number: true,
                clientId: true,
                projectId: true,
                status: true,
              },
            },
          },
        });

      existingRequest =
        referencedEmail?.supportRequest ?? null;
    }

    if (existingRequest) {
        const message = normalizeMessageBody(payload);
        const receivedAt = payload.Date
          ? new Date(payload.Date)
          : new Date();

        await prisma.$transaction(async (transaction) => {
          await transaction.supportEmailMessage.create({
            data: {
              supportRequestId: existingRequest.id,
              providerMessageId,
              internetMessageId,
              direction: "INBOUND",
              fromEmail,
              toEmail:
                payload.OriginalRecipient?.trim() ||
                payload.To?.trim() ||
                SUPPORT_EMAIL,
              subject: requestSubject,
              receivedAt: Number.isNaN(receivedAt.getTime())
                ? new Date()
                : receivedAt,
            },
          });

          await transaction.supportComment.create({
            data: {
              supportRequestId: existingRequest.id,
              authorName: requesterName || fromEmail,
              authorType: "CLIENT",
              message,
              internal: false,
            },
          });

          if (
            existingRequest.status === "WAITING_FOR_CLIENT"
          ) {
            await transaction.supportRequest.update({
              where: {
                id: existingRequest.id,
              },
              data: {
                status: "UNDER_REVIEW",
              },
            });
          }

          await transaction.activityLog.create({
            data: {
              clientId: existingRequest.clientId,
              projectId: existingRequest.projectId,
              supportRequestId: existingRequest.id,
              action: "SUPPORT_EMAIL_REPLY_RECEIVED",
              entityType: "SupportRequest",
              entityId: existingRequest.id,
              description: `Respuesta recibida por correo desde ${fromEmail}.`,
              metadata: {
                provider: "postmark",
                providerMessageId,
              },
            },
          });
        });

        revalidatePath("/");
        revalidatePath("/solicitudes");
        revalidatePath(`/solicitudes/${existingRequest.id}`);

        return NextResponse.json({
          accepted: true,
          kind: "reply",
          requestNumber: existingRequest.number,
        });
    }

    const association =
      await findClientAndProject(fromEmail);
    const description = normalizeMessageBody(payload);
    const receivedAt = payload.Date
      ? new Date(payload.Date)
      : new Date();

    const created = await prisma.$transaction(
      async (transaction) => {
        const supportRequest =
          await transaction.supportRequest.create({
            data: {
              clientId: association.clientId,
              projectId: association.projectId,
              subject: requestSubject,
              description,
              priority: "NORMAL",
              status: "RECEIVED",
              source: "EMAIL",
              requesterName,
              requesterEmail: fromEmail,
              internalNotes:
                "Ingreso automático desde hosting@vialoop.cl.",
            },
          });

        const emailMessage =
          await transaction.supportEmailMessage.create({
            data: {
              supportRequestId: supportRequest.id,
              providerMessageId,
              internetMessageId,
              direction: "INBOUND",
              fromEmail,
              toEmail:
                payload.OriginalRecipient?.trim() ||
                payload.To?.trim() ||
                SUPPORT_EMAIL,
              subject: requestSubject,
              automaticReplyRequired: true,
              receivedAt: Number.isNaN(receivedAt.getTime())
                ? new Date()
                : receivedAt,
            },
          });

        await transaction.activityLog.create({
          data: {
            clientId: association.clientId,
            projectId: association.projectId,
            supportRequestId: supportRequest.id,
            action: "SUPPORT_REQUEST_CREATED_FROM_EMAIL",
            entityType: "SupportRequest",
            entityId: supportRequest.id,
            description: `Solicitud #${supportRequest.number
              .toString()
              .padStart(4, "0")} creada automáticamente desde ${fromEmail}.`,
            metadata: {
              provider: "postmark",
              providerMessageId,
              automaticallyAssociated:
                Boolean(association.clientId),
            },
          },
        });

        return {
          supportRequest,
          emailMessage,
        };
      },
    );

    const acknowledgement = await sendPendingAcknowledgement(
      created.emailMessage.id,
      created.supportRequest.number,
      created.supportRequest.subject,
      fromEmail,
      requesterName,
      internetMessageId,
    );

    revalidatePath("/");
    revalidatePath("/solicitudes");
    revalidatePath(
      `/solicitudes/${created.supportRequest.id}`,
    );

    if (association.clientId) {
      revalidatePath(`/clientes/${association.clientId}`);
    }

    return NextResponse.json({
      accepted: true,
      kind: "new",
      requestNumber: created.supportRequest.number,
      acknowledgement,
      associated: Boolean(association.clientId),
    });
  } catch (error) {
    console.error("Error al procesar correo de soporte:", error);

    return NextResponse.json(
      {
        error:
          "No fue posible procesar el correo de soporte.",
      },
      { status: 500 },
    );
  }
}
