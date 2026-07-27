import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { createFlowPayment } from "@/lib/flow";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

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
  const button =
    paymentUrl
      ? `
        <a
          href="${escapeHtml(
            paymentUrl,
          )}"
          target="_blank"
          style="
            display:inline-block;
            margin:22px 0;
            padding:14px 24px;
            border-radius:8px;
            background:#2563eb;
            color:#ffffff;
            text-decoration:none;
            font-weight:700;
          "
        >
          Pagar ahora con Flow
        </a>
      `
      : "";

  const testBanner =
    testMode
      ? `
        <div
          style="
            margin-bottom:22px;
            padding:14px;
            border:1px solid #fed7aa;
            border-radius:8px;
            background:#fff7ed;
            color:#9a3412;
            font-size:13px;
            line-height:1.6;
          "
        >
          <strong>
            MODO DE PRUEBA
          </strong>

          <br />

          Destinatario real:
          ${escapeHtml(
            realRecipient,
          )}

          <br />

          Cliente:
          ${escapeHtml(
            renewal.client
              .businessName,
          )}
        </div>
      `
      : "";

  return `
    <!doctype html>

    <html lang="es">
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          Renovación de servicio
        </title>
      </head>

      <body
        style="
          margin:0;
          background:#f3f5f8;
          font-family:Arial,Helvetica,sans-serif;
          color:#172033;
        "
      >
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          style="
            width:100%;
            padding:32px 14px;
            background:#f3f5f8;
          "
        >
          <tr>
            <td align="center">
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                  width:100%;
                  max-width:640px;
                  border:1px solid #e3e7ee;
                  border-radius:14px;
                  background:#ffffff;
                  overflow:hidden;
                "
              >
                <tr>
                  <td
                    style="
                      padding:26px 30px;
                      background:#111827;
                      color:#ffffff;
                    "
                  >
                    <div
                      style="
                        font-size:22px;
                        font-weight:700;
                      "
                    >
                      Vialoop Studio
                    </div>

                    <div
                      style="
                        margin-top:6px;
                        color:#cbd5e1;
                        font-size:13px;
                      "
                    >
                      Hosting, renovaciones
                      y servicios digitales
                    </div>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:32px 30px;
                    "
                  >
                    ${testBanner}

                    <p
                      style="
                        margin:0 0 20px;
                        line-height:1.7;
                      "
                    >
                      ${escapeHtml(
                        getGreeting(
                          renewal.client
                            .mainContactName,
                        ),
                      )}
                    </p>

                    <p
                      style="
                        margin:0 0 22px;
                        line-height:1.7;
                      "
                    >
                      ${escapeHtml(
                        getIntroduction(
                          reminderType,
                        ),
                      )}
                    </p>

                    <div
                      style="
                        margin-bottom:22px;
                        padding:18px;
                        border:1px solid #e4e8ef;
                        border-radius:10px;
                        background:#f8fafc;
                        line-height:1.8;
                      "
                    >
                      <strong>
                        Servicio:
                      </strong>

                      ${escapeHtml(
                        renewal.description,
                      )}

                      <br />

                      <strong>
                        Dominio o proyecto:
                      </strong>

                      ${escapeHtml(
                        domain,
                      )}

                      <br />

                      <strong>
                        Fecha de vencimiento:
                      </strong>

                      ${escapeHtml(
                        formatDate(
                          renewal.dueDate,
                        ),
                      )}

                      <br />

                      <strong>
                        Monto total con IVA:
                      </strong>

                      <span
                        style="
                          color:#1d4ed8;
                          font-size:18px;
                          font-weight:800;
                        "
                      >
                        ${escapeHtml(
                          formatCurrency(
                            amount,
                          ),
                        )}
                      </span>
                    </div>

                    <p
                      style="
                        margin:0;
                        line-height:1.7;
                      "
                    >
                      ${escapeHtml(
                        getClosingParagraph(
                          reminderType,
                        ),
                      )}
                    </p>

                    ${button}

                    <div
                      style="
                        margin:22px 0;
                        padding:18px;
                        border:1px solid #e4e8ef;
                        border-radius:10px;
                        background:#f8fafc;
                        font-size:13px;
                        line-height:1.8;
                      "
                    >
                      <strong>
                        Datos para transferencia
                      </strong>

                      <br />
                      <br />

                      <strong>
                        ${escapeHtml(
                          BANK_ACCOUNT
                            .holder,
                        )}
                      </strong>

                      <br />

                      RUT:
                      ${escapeHtml(
                        BANK_ACCOUNT
                          .rut,
                      )}

                      <br />

                      Banco:
                      ${escapeHtml(
                        BANK_ACCOUNT
                          .bank,
                      )}

                      <br />

                      Tipo de cuenta:
                      ${escapeHtml(
                        BANK_ACCOUNT
                          .accountType,
                      )}

                      <br />

                      N.º de cuenta:
                      ${escapeHtml(
                        BANK_ACCOUNT
                          .accountNumber,
                      )}

                      <br />

                      Correo:
                      ${escapeHtml(
                        BANK_ACCOUNT
                          .email,
                      )}
                    </div>

                    <p
                      style="
                        margin:0 0 22px;
                        color:#475467;
                        font-size:14px;
                        line-height:1.7;
                      "
                    >
                      Una vez realizado el
                      pago, favor responder
                      este correo adjuntando
                      el comprobante
                      correspondiente.
                    </p>

                    <p
                      style="
                        margin:0;
                        font-size:14px;
                        line-height:1.7;
                      "
                    >
                      Saludos cordiales,

                      <br />
                      <br />

                      <strong>
                        Equipo Vialoop
                      </strong>

                      <br />

                      Vialoop Studio SpA

                      <br />

                      hosting@vialoop.cl

                      <br />

                      www.vialoop.cl
                    </p>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:20px 30px;
                      border-top:1px solid #edf0f4;
                      color:#8a93a2;
                      font-size:12px;
                    "
                  >
                    Correo enviado
                    automáticamente por el
                    sistema de renovaciones
                    de Vialoop Studio.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
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