import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { createFlowPayment } from "@/lib/flow";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { buildVialoopEmailLayout } from "@/lib/vialoop-email";

type ReminderType =
  | "FIRST_NOTICE"
  | "SECOND_NOTICE"
  | "FINAL_NOTICE"
  | "OVERDUE_NOTICE";

type AutomaticEmailMode =
  | "off"
  | "test"
  | "live";

type RenewalCandidate =
  Prisma.RenewalGetPayload<{
    include: {
      client: true;
      project: true;
      notifications: {
        select: {
          type: true;
        };
      };
    };
  }>;

type AutomaticPayment = {
  id: string;
  clientId: string;
  description: string;
  amount: unknown;
  status: string;
  reference: string | null;
  flowOrders: Array<{
    id: string;
    status: string;
    paymentUrl: string | null;
    flowOrder: number | null;
    createdAt: Date;
  }>;
};

type AutomaticRenewalResult = {
  mode: AutomaticEmailMode;
  reviewed: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    renewalId: string;
    client: string;
    recipient: string | null;
    reminderType:
      | ReminderType
      | null;
    status:
      | "sent"
      | "test-sent"
      | "skipped"
      | "error";
    message: string;
  }>;
};

const BANK_ACCOUNT = {
  holder:
    "Vialoop Studio SPA",
  rut:
    "78.455.385-k",
  bank:
    "Mercado Pago",
  accountType:
    "Cuenta Vista",
  accountNumber:
    "1038393364",
  email:
    "rmanzo@vialoop.cl",
};

function getAutomaticEmailMode():
  AutomaticEmailMode {
  const value =
    process.env.AUTO_RENEWAL_MODE
      ?.trim()
      .toLowerCase() ??
    "off";

  return value === "test" ||
    value === "live"
    ? value
    : "off";
}

function getMaximumEmails() {
  const value =
    Number(
      process.env
        .AUTO_RENEWAL_MAX_EMAILS ??
        "5",
    );

  return Number.isInteger(value) &&
    value > 0
    ? Math.min(
        value,
        100,
      )
    : 5;
}

function getRequiredTestRecipient() {
  const value =
    process.env
      .AUTO_RENEWAL_TEST_RECIPIENT
      ?.trim();

  if (!value) {
    throw new Error(
      "Falta configurar AUTO_RENEWAL_TEST_RECIPIENT para utilizar el modo test.",
    );
  }

  return value;
}

function getRequiredAppUrl() {
  const value =
    process.env.FLOW_APP_URL
      ?.trim()
      .replace(
        /\/+$/,
        "",
      );

  if (!value) {
    throw new Error(
      "Falta configurar FLOW_APP_URL.",
    );
  }

  return value;
}

function isValidEmail(
  value: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim(),
  );
}

function getChileDateKey(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function getDaysDifference(
  dueDate: Date,
  currentDate =
    new Date(),
) {
  const due =
    new Date(
      `${getChileDateKey(
        dueDate,
      )}T00:00:00.000Z`,
    ).getTime();

  const current =
    new Date(
      `${getChileDateKey(
        currentDate,
      )}T00:00:00.000Z`,
    ).getTime();

  return Math.round(
    (due - current) /
      (
        1000 *
        60 *
        60 *
        24
      ),
  );
}

function formatDate(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function formatCurrency(
  value: unknown,
) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return "Sin monto registrado";
  }

  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(amount);
}

function appendNote(
  currentNotes:
    | string
    | null,
  newNote: string,
) {
  return [
    currentNotes,
    newNote,
  ]
    .filter(Boolean)
    .join("\n");
}

function getGreeting(
  mainContactName:
    | string
    | null,
) {
  const name =
    mainContactName?.trim();

  return name
    ? `A la atención de ${name}:`
    : "Estimados,";
}

function getRenewalTypeLabel(
  type:
    RenewalCandidate["type"],
) {
  const labels: Record<
    RenewalCandidate["type"],
    string
  > = {
    DOMAIN:
      "Dominio",
    HOSTING:
      "Hosting",
    EMAIL:
      "Correo",
    SSL:
      "Certificado SSL",
    SUBSCRIPTION:
      "Suscripción",
    ADDITIONAL_SERVICE:
      "Servicio adicional",
  };

  return labels[type];
}

function getReminderLabel(
  type: ReminderType,
) {
  const labels: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      "Primer aviso",
    SECOND_NOTICE:
      "Segundo recordatorio",
    FINAL_NOTICE:
      "Recordatorio final",
    OVERDUE_NOTICE:
      "Seguimiento de servicio vencido",
  };

  return labels[type];
}

function getReminderType(
  daysUntilDueDate: number,
): ReminderType {
  if (
    daysUntilDueDate < 0
  ) {
    return "OVERDUE_NOTICE";
  }

  if (
    daysUntilDueDate <= 7
  ) {
    return "FINAL_NOTICE";
  }

  if (
    daysUntilDueDate <= 15
  ) {
    return "SECOND_NOTICE";
  }

  return "FIRST_NOTICE";
}

function getIntroduction(
  type: ReminderType,
) {
  const values: Record<
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
  };

  return values[type];
}

function getClosingParagraph(
  type: ReminderType,
) {
  if (
    type ===
    "OVERDUE_NOTICE"
  ) {
    return "Para evitar la suspensión o interrupción del servicio, agradeceremos regularizar el pago a la brevedad.";
  }

  if (
    type ===
    "FINAL_NOTICE"
  ) {
    return "Para mantener la continuidad del servicio y evitar interrupciones, agradeceremos gestionar el pago antes de la fecha indicada.";
  }

  return "Para mantener la continuidad del servicio, agradeceremos gestionar el pago antes de la fecha indicada.";
}

function getSubject(
  type: ReminderType,
  serviceName: string,
  domain: string,
) {
  const service =
    serviceName.toLowerCase();

  const subjects: Record<
    ReminderType,
    string
  > = {
    FIRST_NOTICE:
      `Aviso de renovación de ${service} · ${domain}`,

    SECOND_NOTICE:
      `Segundo aviso: renovación de ${service} · ${domain}`,

    FINAL_NOTICE:
      `Recordatorio final: renovación de ${service} · ${domain}`,

    OVERDUE_NOTICE:
      `Servicio vencido: renovación de ${service} · ${domain}`,
  };

  return subjects[type];
}

function hasReminderAlreadyBeenSent(
  renewal:
    RenewalCandidate,
  reminderType:
    ReminderType,
) {
  return renewal
    .notifications
    .some(
      ({
        type,
      }) =>
        type ===
        reminderType,
    );
}

function getSentOnDate(
  date =
    new Date(),
) {
  return new Date(
    `${getChileDateKey(
      date,
    )}T12:00:00.000Z`,
  );
}

function createCommerceOrder() {
  const suffix =
    randomUUID()
      .replaceAll(
        "-",
        "",
      )
      .slice(
        0,
        12,
      );

  return `PV-${Date.now()}-${suffix}`;
}

function normalizeFlowSubject(
  description: string,
) {
  const value =
    description.trim();

  return value.length <= 120
    ? value
    : `${value.slice(
        0,
        117,
      )}...`;
}

async function ensurePaymentForRenewal(
  renewal:
    RenewalCandidate,
  daysUntilDueDate:
    number,
): Promise<AutomaticPayment> {
  if (
    renewal.amount === null
  ) {
    throw new Error(
      "La renovación no tiene un monto registrado.",
    );
  }

  const reference =
    `renewal:${renewal.id}`;

  const desiredStatus =
    daysUntilDueDate < 0
      ? "OVERDUE"
      : "PENDING";

  const existingPayment =
    await prisma.payment
      .findFirst({
        where: {
          clientId:
            renewal.clientId,

          reference,

          status: {
            in: [
              "PENDING",
              "OVERDUE",
              "PAID",
            ],
          },
        },

        orderBy: {
          createdAt:
            "desc",
        },

        include: {
          flowOrders: {
            orderBy: {
              createdAt:
                "desc",
            },
          },
        },
      });

  if (
    !existingPayment
  ) {
    return prisma.payment
      .create({
        data: {
          clientId:
            renewal.clientId,

          subscriptionId:
            renewal.subscriptionId,

          description:
            renewal.description,

          amount:
            renewal.amount,

          dueDate:
            renewal.dueDate,

          status:
            desiredStatus,

          reference,

          notes: [
            `Cobro creado automáticamente para la renovación ${renewal.id}.`,

            renewal.project
              ?.domain
              ? `Dominio: ${renewal.project.domain}.`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },

        include: {
          flowOrders:
            true,
        },
      });
  }

  if (
    existingPayment
      .status === "PAID"
  ) {
    return existingPayment;
  }

  const hasOpenFlowLink =
    existingPayment
      .flowOrders
      .some(
        ({
          status,
          paymentUrl,
        }) =>
          status ===
            "PENDING" &&
          Boolean(
            paymentUrl,
          ),
      );

  const amountChanged =
    Math.round(
      Number(
        existingPayment
          .amount,
      ),
    ) !==
    Math.round(
      Number(
        renewal.amount,
      ),
    );

  return prisma.payment
    .update({
      where: {
        id:
          existingPayment.id,
      },

      data: {
        description:
          renewal.description,

        dueDate:
          renewal.dueDate,

        status:
          desiredStatus,

        ...(
          !hasOpenFlowLink &&
          amountChanged
            ? {
                amount:
                  renewal.amount,
              }
            : {}
        ),
      },

      include: {
        flowOrders: {
          orderBy: {
            createdAt:
              "desc",
          },
        },
      },
    });
}

async function ensureFlowOrderForPayment(
  payment:
    AutomaticPayment,
  renewal:
    RenewalCandidate,
) {
  if (
    payment.status ===
    "PAID"
  ) {
    return {
      state:
        "paid" as const,

      paymentUrl:
        null,

      flowOrder:
        null,
    };
  }

  const paidOrder =
    payment.flowOrders.find(
      ({
        status,
      }) =>
        status === "PAID",
    );

  if (paidOrder) {
    return {
      state:
        "paid" as const,

      paymentUrl:
        null,

      flowOrder:
        paidOrder.flowOrder,
    };
  }

  const reusableOrder =
    payment.flowOrders.find(
      ({
        status,
        paymentUrl,
      }) =>
        status ===
          "PENDING" &&
        Boolean(
          paymentUrl,
        ),
    );

  if (
    reusableOrder
      ?.paymentUrl
  ) {
    return {
      state:
        "ready" as const,

      paymentUrl:
        reusableOrder
          .paymentUrl,

      flowOrder:
        reusableOrder
          .flowOrder,
    };
  }

  const payerEmail =
    renewal.client.email
      ?.trim() ??
    "";

  const amount =
    Math.round(
      Number(
        payment.amount,
      ),
    );

  if (
    !isValidEmail(
      payerEmail,
    )
  ) {
    throw new Error(
      "El cliente no tiene un correo válido para generar Flow.",
    );
  }

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "El cobro no tiene un monto válido para generar Flow.",
    );
  }

  const appUrl =
    getRequiredAppUrl();

  const commerceOrder =
    createCommerceOrder();

  const subject =
    normalizeFlowSubject(
      payment.description,
    );

  const flowResult =
    await createFlowPayment({
      commerceOrder,

      subject,

      amount,

      email:
        payerEmail,

      urlConfirmation:
        `${appUrl}/api/flow/confirmacion`,

      urlReturn:
        `${appUrl}/api/flow/retorno`,

      optional: {
        paymentId:
          payment.id,

        clientId:
          payment.clientId,

        renewalId:
          renewal.id,

        reference:
          payment.reference,

        source:
          "automatic-renewal-email",
      },
    });

  const localOrder =
    await prisma.flowOrder
      .create({
        data: {
          paymentId:
            payment.id,

          commerceOrder,

          flowOrder:
            flowResult.flowOrder,

          token:
            flowResult.token,

          paymentUrl:
            flowResult.url,

          status:
            "PENDING",

          amount,

          payerEmail,

          subject,

          rawResponse: {
            flowOrder:
              flowResult.flowOrder,

            token:
              flowResult.token,

            paymentUrl:
              flowResult.url,

            source:
              "automatic-renewal-email",
          },
        },
      });

  await prisma.activityLog
    .create({
      data: {
        clientId:
          payment.clientId,

        projectId:
          renewal.projectId,

        action:
          "AUTOMATIC_FLOW_ORDER_CREATED",

        entityType:
          "FlowOrder",

        entityId:
          localOrder.id,

        description:
          `Orden Flow ${flowResult.flowOrder} creada automáticamente para la renovación ${renewal.id}.`,

        metadata: {
          paymentId:
            payment.id,

          renewalId:
            renewal.id,

          commerceOrder,

          flowOrder:
            flowResult.flowOrder,

          payerEmail,

          amount,
        },
      },
    });

  return {
    state:
      "ready" as const,

    paymentUrl:
      flowResult.url,

    flowOrder:
      flowResult.flowOrder,
  };
}

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}

function buildEmailText(
  renewal:
    RenewalCandidate,
  reminderType:
    ReminderType,
  domain: string,
  amount: unknown,
  paymentUrl:
    | string
    | null,
  testMode: boolean,
  realRecipient: string,
) {
  const content = [
    getGreeting(
      renewal.client
        .mainContactName,
    ),

    "",

    getIntroduction(
      reminderType,
    ),

    "",

    `Servicio: ${renewal.description}`,

    `Dominio o proyecto: ${domain}`,

    `Fecha de vencimiento: ${formatDate(
      renewal.dueDate,
    )}`,

    `Monto total con IVA: ${formatCurrency(
      amount,
    )}`,

    "",

    getClosingParagraph(
      reminderType,
    ),

    "",

    ...(
      paymentUrl
        ? [
            "Pagar en línea con Flow:",
            paymentUrl,
            "",
          ]
        : []
    ),

    "También puedes realizar una transferencia a:",

    "",

    BANK_ACCOUNT.holder,

    `RUT: ${BANK_ACCOUNT.rut}`,

    `Banco: ${BANK_ACCOUNT.bank}`,

    `Tipo de cuenta: ${BANK_ACCOUNT.accountType}`,

    `N.º de cuenta: ${BANK_ACCOUNT.accountNumber}`,

    `Correo: ${BANK_ACCOUNT.email}`,

    "",

    "Una vez realizado el pago, favor responder este correo adjuntando el comprobante correspondiente.",

    "",

    "Saludos cordiales,",

    "",

    "Equipo Vialoop",

    "Vialoop Studio SpA",

    "hosting@vialoop.cl",

    "www.vialoop.cl",
  ].join("\n");

  return testMode
    ? [
        "MODO DE PRUEBA",

        "",

        `Destinatario real: ${realRecipient}`,

        `Cliente: ${renewal.client.businessName}`,

        "",

        "El siguiente contenido habría sido enviado al cliente:",

        "",

        content,
      ].join("\n")
    : content;
}

function buildEmailHtml(
  renewal: RenewalCandidate,
  reminderType: ReminderType,
  domain: string,
  amount: unknown,
  paymentUrl: string | null,
  testMode: boolean,
  realRecipient: string,
) {
  const dueDate = formatDate(renewal.dueDate);
  const amountText = formatCurrency(amount);
  const reminderLabel = getReminderLabel(reminderType);
  const paymentAction = paymentUrl
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:16px 0 18px;border-collapse:collapse;">
        <tr>
          <td align="left">
            <a href="${escapeHtml(paymentUrl)}" target="_blank" style="display:inline-block;border-radius:7px;background:#245bd6;padding:11px 16px;color:#ffffff;font-size:12px;font-weight:750;text-decoration:none;">Pagar en línea con Flow</a>
          </td>
        </tr>
      </table>
    `
    : "";
  const testBanner = testMode
    ? `
      <div style="margin:0 0 15px;border:1px solid #f0d9a4;background:#fff8e8;padding:10px 12px;color:#8a5407;font-size:11px;line-height:1.55;">
        <strong style="display:block;margin-bottom:3px;">MODO DE PRUEBA</strong>
        Destinatario real: ${escapeHtml(realRecipient)}<br />
        Cliente: ${escapeHtml(renewal.client.businessName)}
      </div>
    `
    : "";

  const content = `
    ${testBanner}
    <p style="margin:0 0 8px;color:#172033;font-size:14px;font-weight:700;line-height:1.55;">${escapeHtml(getGreeting(renewal.client.mainContactName))}</p>
    <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.65;">${escapeHtml(getIntroduction(reminderType))}</p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #dfe6ee;border-collapse:collapse;background:#ffffff;">
      <tr>
        <td style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Servicio</td>
        <td align="right" style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:750;">${escapeHtml(renewal.description)}</td>
      </tr>
      <tr>
        <td style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Dominio o referencia</td>
        <td align="right" style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:750;">${escapeHtml(domain)}</td>
      </tr>
      <tr>
        <td style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Vencimiento</td>
        <td align="right" style="padding:9px 13px;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:750;">${escapeHtml(dueDate)}</td>
      </tr>
      <tr>
        <td style="padding:12px 13px;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Total con IVA</td>
        <td align="right" style="padding:12px 13px;color:#245bd6;font-size:20px;font-weight:800;">${escapeHtml(amountText)}</td>
      </tr>
    </table>

    <p style="margin:16px 0 0;color:#475569;font-size:12.5px;line-height:1.65;">${escapeHtml(getClosingParagraph(reminderType))}</p>
    ${paymentAction}

    <div style="margin:0 0 8px;color:#172033;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Transferencia bancaria</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-top:1px solid #e5eaf0;border-collapse:collapse;">
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Titular</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(BANK_ACCOUNT.holder)}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">RUT</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(BANK_ACCOUNT.rut)}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">Banco / tipo</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(BANK_ACCOUNT.bank)} · ${escapeHtml(BANK_ACCOUNT.accountType)}</td></tr>
      <tr><td style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#64748b;font-size:11px;">N.º de cuenta</td><td align="right" style="padding:7px 0;border-bottom:1px solid #edf1f5;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(BANK_ACCOUNT.accountNumber)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;font-size:11px;">Correo</td><td align="right" style="padding:7px 0;color:#172033;font-size:11px;font-weight:700;">${escapeHtml(BANK_ACCOUNT.email)}</td></tr>
    </table>

    <p style="margin:15px 0 0;color:#475569;font-size:12px;line-height:1.6;">Una vez realizado el pago, responde este correo adjuntando el comprobante correspondiente.</p>
    <p style="margin:17px 0 0;padding-top:13px;border-top:1px solid #e5eaf0;color:#475569;font-size:12px;line-height:1.55;">Saludos cordiales,<br /><strong style="color:#172033;">Equipo Vialoop</strong><br />hosting@vialoop.cl</p>
  `;

  return buildVialoopEmailLayout({
    eyebrow: "Renovaciones Vialoop",
    title:
      reminderType === "OVERDUE_NOTICE"
        ? "Servicio pendiente de regularización"
        : "Renovación de servicio",
    reference: reminderLabel,
    preheader: `${renewal.client.businessName} · ${renewal.description} · ${dueDate}`,
    content,
    footer:
      "Vialoop Studio SpA · vialoop.cl<br />Control de hosting, dominios y servicios recurrentes.",
  });
}
export async function processAutomaticRenewalEmails():
  Promise<AutomaticRenewalResult> {
  const mode =
    getAutomaticEmailMode();

  const result:
    AutomaticRenewalResult = {
      mode,
      reviewed: 0,
      eligible: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

  if (
    mode === "off"
  ) {
    result.details.push({
      renewalId:
        "system",

      client:
        "Sistema",

      recipient:
        null,

      reminderType:
        null,

      status:
        "skipped",

      message:
        "La automatización se encuentra desactivada.",
    });

    return result;
  }

  const testRecipient =
    mode === "test"
      ? getRequiredTestRecipient()
      : null;

  if (
    testRecipient &&
    !isValidEmail(
      testRecipient,
    )
  ) {
    throw new Error(
      "AUTO_RENEWAL_TEST_RECIPIENT no contiene un correo válido.",
    );
  }

  const renewals:
    RenewalCandidate[] =
    await prisma.renewal
      .findMany({
        where: {
          status: {
            in: [
              "UPCOMING",
              "NOTIFIED",
              "EXPIRED",
            ],
          },
        },

        orderBy: {
          dueDate:
            "asc",
        },

        include: {
          client:
            true,

          project:
            true,

          notifications: {
            select: {
              type:
                true,
            },
          },
        },
      });

  result.reviewed =
    renewals.length;

  const maximumEmails =
    getMaximumEmails();

  let processedEmails =
    0;

  for (
    const renewal
    of renewals
  ) {
    const daysUntilDueDate =
      getDaysDifference(
        renewal.dueDate,
      );

    if (
      daysUntilDueDate > 30
    ) {
      continue;
    }

    result.eligible += 1;

    const reminderType =
      getReminderType(
        daysUntilDueDate,
      );

    const realRecipient =
      renewal.client.email
        ?.trim() ??
      "";

    const skip = (
      message: string,
    ) => {
      result.skipped += 1;

      result.details.push({
        renewalId:
          renewal.id,

        client:
          renewal.client
            .businessName,

        recipient:
          realRecipient ||
          null,

        reminderType,

        status:
          "skipped",

        message,
      });
    };

    if (
      hasReminderAlreadyBeenSent(
        renewal,
        reminderType,
      )
    ) {
      skip(
        `${getReminderLabel(
          reminderType,
        )} ya registrado anteriormente.`,
      );

      continue;
    }

    if (
      processedEmails >=
      maximumEmails
    ) {
      skip(
        "Se alcanzó el límite máximo de correos de esta ejecución.",
      );

      continue;
    }

    if (
      !isValidEmail(
        realRecipient,
      )
    ) {
      skip(
        "El cliente no tiene un correo válido registrado.",
      );

      continue;
    }

    if (
      renewal.amount === null
    ) {
      skip(
        "La renovación no tiene un monto registrado.",
      );

      continue;
    }

    const domain =
      renewal.project
        ?.domain ??
      renewal.project
        ?.name ??
      "Servicio Vialoop";

    const serviceName =
      getRenewalTypeLabel(
        renewal.type,
      );

    const originalSubject =
      getSubject(
        reminderType,
        serviceName,
        domain,
      );

    try {
      let paymentUrl:
        | string
        | null = null;

      let amount:
        unknown =
        renewal.amount;

      let paymentId:
        | string
        | null = null;

      let flowOrderNumber:
        | number
        | null = null;

      if (
        mode === "live"
      ) {
        const payment =
          await ensurePaymentForRenewal(
            renewal,
            daysUntilDueDate,
          );

        if (
          payment.status ===
          "PAID"
        ) {
          skip(
            "El cobro asociado ya se encuentra pagado.",
          );

          continue;
        }

        const flowOrder =
          await ensureFlowOrderForPayment(
            payment,
            renewal,
          );

        if (
          flowOrder.state ===
          "paid"
        ) {
          skip(
            "La orden Flow asociada ya aparece pagada.",
          );

          continue;
        }

        paymentUrl =
          flowOrder.paymentUrl;

        amount =
          payment.amount;

        paymentId =
          payment.id;

        flowOrderNumber =
          flowOrder.flowOrder;
      }

      const subject =
        mode === "test"
          ? `[PRUEBA AUTOMÁTICA] ${originalSubject}`
          : originalSubject;

      const text =
        buildEmailText(
          renewal,
          reminderType,
          domain,
          amount,
          paymentUrl,
          mode === "test",
          realRecipient,
        );

      const html =
        buildEmailHtml(
          renewal,
          reminderType,
          domain,
          amount,
          paymentUrl,
          mode === "test",
          realRecipient,
        );

      const recipient =
        mode === "test"
          ? testRecipient!
          : realRecipient;

      const mailResult =
        await sendEmail({
          to:
            recipient,

          subject,

          text,

          html,
        });

      processedEmails += 1;

      result.sent += 1;

      if (
        mode === "test"
      ) {
        await prisma.activityLog
          .create({
            data: {
              clientId:
                renewal.clientId,

              projectId:
                renewal.projectId,

              action:
                "AUTOMATIC_RENEWAL_EMAIL_TEST",

              entityType:
                "Renewal",

              entityId:
                renewal.id,

              description:
                `Prueba automática enviada a ${recipient}. El destinatario real habría sido ${realRecipient}.`,

              metadata: {
                mode,

                realRecipient,

                testRecipient:
                  recipient,

                reminderType,

                subject,

                smtpMessageId:
                  mailResult.messageId,
              },
            },
          });

        result.details.push({
          renewalId:
            renewal.id,

          client:
            renewal.client
              .businessName,

          recipient,

          reminderType,

          status:
            "test-sent",

          message:
            "Prueba enviada. El cliente real no recibió el correo.",
        });

        continue;
      }

      const sentAt =
        new Date();

      const sentOn =
        getSentOnDate(
          sentAt,
        );

      await prisma.$transaction(
        async (
          transaction,
        ) => {
          await transaction
            .renewalNotification
            .create({
              data: {
                renewalId:
                  renewal.id,

                type:
                  reminderType,

                recipient:
                  realRecipient,

                subject:
                  originalSubject,

                body:
                  text,

                sentOn,

                sentAt,
              },
            });

          await transaction
            .renewal
            .update({
              where: {
                id:
                  renewal.id,
              },

              data: {
                status:
                  "NOTIFIED",

                notifiedAt:
                  sentAt,

                notes:
                  appendNote(
                    renewal.notes,
                    [
                      `${getReminderLabel(
                        reminderType,
                      )} automático enviado el ${formatDate(
                        sentAt,
                      )}.`,

                      `Destinatario: ${realRecipient}.`,

                      paymentId
                        ? `Cobro: ${paymentId}.`
                        : null,

                      flowOrderNumber
                        ? `Orden Flow: ${flowOrderNumber}.`
                        : null,

                      `SMTP ID: ${mailResult.messageId}.`,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  ),
              },
            });

          await transaction
            .activityLog
            .create({
              data: {
                clientId:
                  renewal.clientId,

                projectId:
                  renewal.projectId,

                action:
                  "AUTOMATIC_RENEWAL_EMAIL_SENT",

                entityType:
                  "Renewal",

                entityId:
                  renewal.id,

                description:
                  `${getReminderLabel(
                    reminderType,
                  )} automático enviado a ${realRecipient}.`,

                metadata: {
                  mode,

                  recipient:
                    realRecipient,

                  reminderType,

                  subject:
                    originalSubject,

                  paymentId,

                  flowOrder:
                    flowOrderNumber,

                  paymentUrl,

                  smtpMessageId:
                    mailResult.messageId,

                  accepted:
                    mailResult.accepted,

                  rejected:
                    mailResult.rejected,

                  smtpResponse:
                    mailResult.response,
                },
              },
            });
        },
      );

      result.details.push({
        renewalId:
          renewal.id,

        client:
          renewal.client
            .businessName,

        recipient:
          realRecipient,

        reminderType,

        status:
          "sent",

        message:
          "Cobro y enlace Flow preparados; correo automático enviado y registrado correctamente.",
      });
    } catch (error) {
      result.errors += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido durante el proceso automático.";

      console.error(
        `Error en renovación automática ${renewal.id}:`,
        error,
      );

      result.details.push({
        renewalId:
          renewal.id,

        client:
          renewal.client
            .businessName,

        recipient:
          realRecipient,

        reminderType,

        status:
          "error",

        message,
      });
    }
  }

  return result;
}
