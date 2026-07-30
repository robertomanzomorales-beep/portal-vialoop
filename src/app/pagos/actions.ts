"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import {
  buildInvoiceEmail,
  buildPaymentReceiptEmail,
} from "@/lib/payment-email-templates";

type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

type BillingCycleValue =
  | "MONTHLY"
  | "SEMIANNUAL"
  | "ANNUAL";

function getOptionalString(
  formData: FormData,
  field: string,
) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue =
    value.trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : null;
}

function getBoolean(
  formData: FormData,
  field: string,
) {
  return (
    formData.get(field) === "on"
  );
}

function getPaymentMethod(
  formData: FormData,
): PaymentMethodValue {
  const value =
    getOptionalString(
      formData,
      "paymentMethod",
    );

  const allowedMethods:
    PaymentMethodValue[] = [
      "BANK_TRANSFER",
      "FLOW",
      "CREDIT_CARD",
      "DEBIT_CARD",
      "CASH",
      "OTHER",
    ];

  if (
    value &&
    allowedMethods.includes(
      value as PaymentMethodValue,
    )
  ) {
    return value as PaymentMethodValue;
  }

  return "BANK_TRANSFER";
}

function getPaymentMethodLabel(
  method: PaymentMethodValue,
) {
  const labels: Record<
    PaymentMethodValue,
    string
  > = {
    BANK_TRANSFER:
      "Transferencia bancaria",
    FLOW: "Flow",
    CREDIT_CARD:
      "Tarjeta de crédito",
    DEBIT_CARD:
      "Tarjeta de débito",
    CASH: "Efectivo",
    OTHER: "Otro medio",
  };

  return labels[method];
}

function getPaymentDate(
  formData: FormData,
) {
  const value =
    getOptionalString(
      formData,
      "paidAt",
    );

  if (!value) {
    return new Date();
  }

  const date = new Date(
    `${value}T12:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new Error(
      "La fecha de pago ingresada no es válida.",
    );
  }

  return date;
}

function getPaymentAmount(
  formData: FormData,
  currentAmount: unknown,
) {
  const value =
    getOptionalString(
      formData,
      "paidAmount",
    );

  if (!value) {
    const currentValue =
      Number(currentAmount);

    if (
      !Number.isFinite(
        currentValue,
      ) ||
      currentValue <= 0
    ) {
      throw new Error(
        "El cobro no tiene un monto válido.",
      );
    }

    return Math.round(
      currentValue,
    );
  }

  /*
   * Los montos del portal se administran
   * como pesos chilenos sin decimales.
   *
   * Ejemplos válidos:
   * 69900
   * 69.900
   * $69.900
   */
  const normalizedValue =
    value.replace(
      /[^\d]/g,
      "",
    );

  const amount = Number(
    normalizedValue,
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "El monto recibido debe ser mayor que cero.",
    );
  }

  return Math.round(amount);
}

function addMonthsPreservingDay(
  date: Date,
  months: number,
) {
  const result = new Date(date);
  const originalDay =
    result.getDate();

  /*
   * Se posiciona temporalmente en el primer
   * día del mes para evitar saltos como:
   * 31 de enero + 1 mes = marzo.
   */
  result.setDate(1);

  result.setMonth(
    result.getMonth() + months,
  );

  const lastDayOfTargetMonth =
    new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
      12,
      0,
      0,
      0,
    ).getDate();

  result.setDate(
    Math.min(
      originalDay,
      lastDayOfTargetMonth,
    ),
  );

  return result;
}

function getNextDueDate(
  currentDueDate: Date,
  billingCycle?:
    BillingCycleValue,
) {
  if (
    billingCycle === "MONTHLY"
  ) {
    return addMonthsPreservingDay(
      currentDueDate,
      1,
    );
  }

  if (
    billingCycle ===
    "SEMIANNUAL"
  ) {
    return addMonthsPreservingDay(
      currentDueDate,
      6,
    );
  }

  /*
   * Suscripciones anuales, hosting,
   * dominios y otros servicios anuales.
   */
  return addMonthsPreservingDay(
    currentDueDate,
    12,
  );
}

function getBillingCycleLabel(
  billingCycle:
    BillingCycleValue,
) {
  const labels: Record<
    BillingCycleValue,
    string
  > = {
    MONTHLY: "Mensual",
    SEMIANNUAL:
      "Semestral",
    ANNUAL: "Anual",
  };

  return labels[billingCycle];
}

function calculateTotalWithVat(
  netAmount: unknown,
) {
  const normalizedNetAmount =
    Math.round(
      Number(netAmount),
    );

  if (
    !Number.isFinite(
      normalizedNetAmount,
    ) ||
    normalizedNetAmount <= 0
  ) {
    throw new Error(
      "El precio acordado de la suscripción no es válido.",
    );
  }

  const vatAmount =
    Math.round(
      normalizedNetAmount *
        0.19,
    );

  return {
    netAmount:
      normalizedNetAmount,
    vatAmount,
    totalWithVat:
      normalizedNetAmount +
      vatAmount,
  };
}

function getDayBounds(
  date: Date,
) {
  const start = new Date(date);
  const end = new Date(date);

  start.setHours(
    0,
    0,
    0,
    0,
  );

  end.setHours(
    23,
    59,
    59,
    999,
  );

  return {
    start,
    end,
  };
}

function appendNote(
  currentNotes: string | null,
  newNote: string,
) {
  return [
    currentNotes,
    newNote,
  ]
    .filter(Boolean)
    .join("\n");
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

function getOptionalFormString(
  formData:
    | FormData
    | undefined,
  field: string,
) {
  if (!formData) {
    return null;
  }

  return getOptionalString(
    formData,
    field,
  );
}

function getRequiredFormString(
  formData: FormData,
  field: string,
  label: string,
) {
  const value =
    getOptionalString(
      formData,
      field,
    );

  if (!value) {
    throw new Error(
      `Debes ingresar ${label}.`,
    );
  }

  return value;
}

function getValidEmail(
  value:
    | string
    | null
    | undefined,
) {
  const email =
    value?.trim();

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw new Error(
      "El correo del destinatario no es válido.",
    );
  }

  return email;
}

function getErrorMessage(
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : "Ocurrió un error desconocido.";

  return message.slice(
    0,
    4000,
  );
}

function calculateAmountsFromTotal(
  totalAmount: unknown,
) {
  const normalizedTotal =
    Math.round(
      Number(totalAmount),
    );

  if (
    !Number.isFinite(
      normalizedTotal,
    ) ||
    normalizedTotal <= 0
  ) {
    throw new Error(
      "El pago no tiene un monto total válido.",
    );
  }

  const netAmount =
    Math.round(
      normalizedTotal /
        1.19,
    );

  return {
    netAmount,
    taxAmount:
      normalizedTotal -
      netAmount,
    totalAmount:
      normalizedTotal,
  };
}

function getMoneyFromForm(
  formData: FormData | undefined,
  field: string,
  fallback: number,
) {
  const value =
    getOptionalFormString(
      formData,
      field,
    );

  if (!value) {
    return fallback;
  }

  const amount = Number(
    value.replace(
      /[^\d]/g,
      "",
    ),
  );

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      "Uno de los montos ingresados no es válido.",
    );
  }

  return Math.round(amount);
}

function getDocumentIssueDate(
  formData: FormData,
) {
  const value =
    getOptionalString(
      formData,
      "invoiceIssueDate",
    );

  if (!value) {
    return new Date();
  }

  const date = new Date(
    `${value}T12:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new Error(
      "La fecha de emisión de la factura no es válida.",
    );
  }

  return date;
}

function getInvoiceFile(
  formData: FormData,
) {
  const value =
    formData.get(
      "invoiceFile",
    );

  if (
    !(value instanceof File)
  ) {
    throw new Error(
      "Debes seleccionar la factura en formato PDF.",
    );
  }

  if (value.size <= 0) {
    throw new Error(
      "El archivo PDF está vacío.",
    );
  }

  const maximumFileSize =
    5 * 1024 * 1024;

  if (
    value.size >
    maximumFileSize
  ) {
    throw new Error(
      "La factura no puede superar los 5 MB.",
    );
  }

  const normalizedName =
    value.name.toLowerCase();

  if (
    value.type !==
      "application/pdf" &&
    !normalizedName.endsWith(
      ".pdf",
    )
  ) {
    throw new Error(
      "El archivo seleccionado debe ser un PDF.",
    );
  }

  return value;
}

function getPaymentsFromEmail() {
  return (
    process.env
      .PAYMENTS_SMTP_FROM_EMAIL
      ?.trim() ||
    process.env
      .PAYMENTS_SMTP_USER
      ?.trim() ||
    "pagos@vialoop.cl"
  );
}

function getInvoicesFromEmail() {
  return (
    process.env
      .BILLING_SMTP_FROM_EMAIL
      ?.trim() ||
    process.env
      .BILLING_SMTP_USER
      ?.trim() ||
    "facturacion@vialoop.cl"
  );
}

async function createOrGetPaymentReceipt(
  paymentId: string,
  formData?: FormData,
) {
  const payment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
      include: {
        client: true,
        subscription: {
          include: {
            project: true,
          },
        },
        receipt: true,
      },
    });

  if (!payment) {
    throw new Error(
      "El pago seleccionado no existe.",
    );
  }

  if (
    payment.status !== "PAID"
  ) {
    throw new Error(
      "El comprobante solo puede emitirse para un pago confirmado.",
    );
  }

  if (
    payment.receipt &&
    !formData
  ) {
    return payment.receipt;
  }

  const recipientName =
    getOptionalFormString(
      formData,
      "receiptRecipientName",
    ) ??
    payment.receipt
      ?.recipientName ??
    payment.client
      .mainContactName ??
    payment.client
      .businessName;

  const recipientEmail =
    getValidEmail(
      getOptionalFormString(
        formData,
        "receiptRecipientEmail",
      ) ??
        payment.receipt
          ?.recipientEmail ??
        payment.client.email,
    );

  const serviceDescription =
    getOptionalFormString(
      formData,
      "receiptServiceDescription",
    ) ??
    payment.receipt
      ?.serviceDescription ??
    payment.description;

  const projectReference =
    getOptionalFormString(
      formData,
      "receiptProjectReference",
    ) ??
    payment.receipt
      ?.projectReference ??
    payment.subscription
      ?.project?.domain ??
    payment.subscription
      ?.project?.name ??
    null;

  const coveragePeriod =
    getOptionalFormString(
      formData,
      "receiptCoveragePeriod",
    ) ??
    payment.receipt
      ?.coveragePeriod ??
    null;

  const paymentReference =
    getOptionalFormString(
      formData,
      "paymentReference",
    ) ??
    payment.receipt
      ?.paymentReference ??
    null;

  const paidAt =
    payment.paidAt ??
    new Date();

  const paymentMethod =
    (payment.method ??
      "OTHER") as PaymentMethodValue;

  const calculatedAmounts =
    calculateAmountsFromTotal(
      payment.amount,
    );

  const netAmount =
    getMoneyFromForm(
      formData,
      "receiptNetAmount",
      Number(
        payment.receipt
          ?.netAmount ??
          calculatedAmounts.netAmount,
      ),
    );

  const taxAmount =
    getMoneyFromForm(
      formData,
      "receiptTaxAmount",
      Number(
        payment.receipt
          ?.taxAmount ??
          calculatedAmounts.taxAmount,
      ),
    );

  const totalAmount =
    getMoneyFromForm(
      formData,
      "receiptTotalAmount",
      Number(
        payment.receipt
          ?.totalAmount ??
          calculatedAmounts.totalAmount,
      ),
    );

  const balanceAmount =
    getMoneyFromForm(
      formData,
      "receiptBalanceAmount",
      0,
    );

  if (payment.receipt) {
    const email =
      buildPaymentReceiptEmail({
        number:
          payment.receipt.number,
        recipientName,
        serviceDescription,
        projectReference,
        coveragePeriod,
        paidAt,
        paymentMethod,
        paymentReference,
        netAmount,
        taxAmount,
        totalAmount,
        balanceAmount,
      });

    return prisma.paymentReceipt.update(
      {
        where: {
          id:
            payment.receipt.id,
        },
        data: {
          recipientName,
          recipientEmail,
          serviceDescription,
          projectReference,
          coveragePeriod,
          paidAt,
          paymentMethod,
          paymentReference,
          netAmount,
          taxAmount,
          totalAmount,
          subject:
            email.subject,
        },
      },
    );
  }

  try {
    return await prisma.$transaction(
      async (
        transaction,
      ) => {
        const existingReceipt =
          await transaction.paymentReceipt.findUnique(
            {
              where: {
                paymentId:
                  payment.id,
              },
            },
          );

        if (
          existingReceipt
        ) {
          return existingReceipt;
        }

        /*
         * nextValue representa el número que
         * acaba de reservarse. El primer upsert
         * crea el contador directamente en 300;
         * los siguientes envíos lo incrementan.
         */
        const counter =
          await transaction.counter.upsert(
            {
              where: {
                key:
                  "payment-receipt-number",
              },
              create: {
                key:
                  "payment-receipt-number",
                nextValue: 300,
              },
              update: {
                nextValue: {
                  increment: 1,
                },
              },
            },
          );

        const email =
          buildPaymentReceiptEmail(
            {
              number:
                counter.nextValue,
              recipientName,
              serviceDescription,
              projectReference,
              coveragePeriod,
              paidAt,
              paymentMethod,
              paymentReference,
              netAmount,
              taxAmount,
              totalAmount,
              balanceAmount,
            },
          );

        return transaction.paymentReceipt.create(
          {
            data: {
              paymentId:
                payment.id,
              number:
                counter.nextValue,
              recipientName,
              recipientEmail,
              serviceDescription,
              projectReference,
              coveragePeriod,
              paidAt,
              paymentMethod,
              paymentReference,
              netAmount,
              taxAmount,
              totalAmount,
              subject:
                email.subject,
            },
          },
        );
      },
    );
  } catch (error) {
    /*
     * Si dos solicitudes intentan emitir el
     * mismo comprobante simultáneamente, la
     * restricción única evita duplicados. Se
     * recupera el comprobante ya creado y se
     * conserva su mismo correlativo.
     */
    const existingReceipt =
      await prisma.paymentReceipt.findUnique(
        {
          where: {
            paymentId:
              payment.id,
          },
        },
      );

    if (existingReceipt) {
      return existingReceipt;
    }

    throw error;
  }
}

async function deliverPaymentReceipt(
  receiptId: string,
  balanceAmount = 0,
) {
  const receipt =
    await prisma.paymentReceipt.findUnique(
      {
        where: {
          id: receiptId,
        },
      },
    );

  if (!receipt) {
    throw new Error(
      "El comprobante seleccionado no existe.",
    );
  }

  const attemptDate =
    new Date();

  await prisma.paymentReceipt.update(
    {
      where: {
        id: receipt.id,
      },
      data: {
        emailStatus:
          "PENDING",
        sendAttempts: {
          increment: 1,
        },
        lastAttemptAt:
          attemptDate,
        lastError: null,
      },
    },
  );

  const email =
    buildPaymentReceiptEmail({
      number: receipt.number,
      recipientName:
        receipt.recipientName,
      serviceDescription:
        receipt.serviceDescription,
      projectReference:
        receipt.projectReference,
      coveragePeriod:
        receipt.coveragePeriod,
      paidAt: receipt.paidAt,
      paymentMethod:
        receipt.paymentMethod as PaymentMethodValue,
      paymentReference:
        receipt.paymentReference,
      netAmount: Number(
        receipt.netAmount,
      ),
      taxAmount: Number(
        receipt.taxAmount,
      ),
      totalAmount: Number(
        receipt.totalAmount,
      ),
      balanceAmount,
    });

  try {
    const result =
      await sendEmail({
        mailAccount:
          "payments",
        to:
          receipt.recipientEmail,
        subject:
          receipt.subject,
        text: email.text,
        html: email.html,
        fromEmail:
          getPaymentsFromEmail(),
        fromName:
          "Pagos Vialoop",
        replyTo:
          getPaymentsFromEmail(),
      });

    await prisma.paymentReceipt.update(
      {
        where: {
          id: receipt.id,
        },
        data: {
          emailStatus:
            "SENT",
          sentAt: new Date(),
          messageId:
            result.messageId,
          lastError: null,
        },
      },
    );

    return {
      sent: true as const,
    };
  } catch (error) {
    await prisma.paymentReceipt.update(
      {
        where: {
          id: receipt.id,
        },
        data: {
          emailStatus:
            "FAILED",
          lastError:
            getErrorMessage(
              error,
            ),
        },
      },
    );

    throw error;
  }
}

async function createPaymentInvoice(
  paymentId: string,
  formData: FormData,
) {
  const payment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
      include: {
        client: true,
        invoice: true,
      },
    });

  if (!payment) {
    throw new Error(
      "El pago seleccionado no existe.",
    );
  }

  if (
    payment.status !== "PAID"
  ) {
    throw new Error(
      "La factura solo puede vincularse a un pago confirmado.",
    );
  }

  if (payment.invoice) {
    throw new Error(
      "Este pago ya tiene una factura vinculada. Utiliza la opción Reenviar factura.",
    );
  }

  const invoiceNumber =
    getRequiredFormString(
      formData,
      "invoiceNumber",
      "el número de la factura",
    );

  const issueDate =
    getDocumentIssueDate(
      formData,
    );

  const recipientName =
    getOptionalString(
      formData,
      "invoiceRecipientName",
    ) ??
    payment.client
      .mainContactName ??
    payment.client
      .businessName;

  const recipientEmail =
    getValidEmail(
      getOptionalString(
        formData,
        "invoiceRecipientEmail",
      ) ??
        payment.client.email,
    );

  const serviceDescription =
    getOptionalString(
      formData,
      "invoiceServiceDescription",
    ) ??
    payment.description;

  const paymentCondition =
    getOptionalString(
      formData,
      "invoicePaymentCondition",
    ) ??
    "Contado";

  const file =
    getInvoiceFile(
      formData,
    );

  const fileData =
    Buffer.from(
      await file.arrayBuffer(),
    );

  const calculatedAmounts =
    calculateAmountsFromTotal(
      payment.amount,
    );

  const netAmount =
    getMoneyFromForm(
      formData,
      "invoiceNetAmount",
      calculatedAmounts.netAmount,
    );

  const taxAmount =
    getMoneyFromForm(
      formData,
      "invoiceTaxAmount",
      calculatedAmounts.taxAmount,
    );

  const totalAmount =
    getMoneyFromForm(
      formData,
      "invoiceTotalAmount",
      calculatedAmounts.totalAmount,
    );

  const email =
    buildInvoiceEmail({
      invoiceNumber,
      recipientName,
      issueDate,
      serviceDescription,
      netAmount,
      taxAmount,
      totalAmount,
      paymentCondition,
      fileName:
        file.name,
    });

  return prisma.paymentInvoice.create(
    {
      data: {
        paymentId:
          payment.id,
        invoiceNumber,
        issueDate,
        recipientName,
        recipientEmail,
        serviceDescription,
        netAmount,
        taxAmount,
        totalAmount,
        fileName:
          file.name,
        mimeType:
          "application/pdf",
        fileSize:
          file.size,
        fileData,
        subject:
          email.subject,
      },
    },
  );
}

async function deliverPaymentInvoice(
  invoiceId: string,
  paymentCondition = "Contado",
) {
  const invoice =
    await prisma.paymentInvoice.findUnique(
      {
        where: {
          id: invoiceId,
        },
      },
    );

  if (!invoice) {
    throw new Error(
      "La factura seleccionada no existe.",
    );
  }

  const attemptDate =
    new Date();

  await prisma.paymentInvoice.update(
    {
      where: {
        id: invoice.id,
      },
      data: {
        emailStatus:
          "PENDING",
        sendAttempts: {
          increment: 1,
        },
        lastAttemptAt:
          attemptDate,
        lastError: null,
      },
    },
  );

  const email =
    buildInvoiceEmail({
      invoiceNumber:
        invoice.invoiceNumber,
      recipientName:
        invoice.recipientName,
      issueDate:
        invoice.issueDate,
      serviceDescription:
        invoice.serviceDescription,
      netAmount: Number(
        invoice.netAmount,
      ),
      taxAmount: Number(
        invoice.taxAmount,
      ),
      totalAmount: Number(
        invoice.totalAmount,
      ),
      paymentCondition,
      fileName:
        invoice.fileName,
    });

  try {
    const result =
      await sendEmail({
        mailAccount:
          "billing",
        to:
          invoice.recipientEmail,
        subject:
          invoice.subject,
        text: email.text,
        html: email.html,
        fromEmail:
          getInvoicesFromEmail(),
        fromName:
          "Facturación Vialoop",
        replyTo:
          getInvoicesFromEmail(),
        attachments: [
          {
            filename:
              invoice.fileName,
            content:
              invoice.fileData,
            contentType:
              invoice.mimeType,
          },
        ],
      });

    await prisma.paymentInvoice.update(
      {
        where: {
          id: invoice.id,
        },
        data: {
          emailStatus:
            "SENT",
          sentAt: new Date(),
          messageId:
            result.messageId,
          lastError: null,
        },
      },
    );

    return {
      sent: true as const,
    };
  } catch (error) {
    await prisma.paymentInvoice.update(
      {
        where: {
          id: invoice.id,
        },
        data: {
          emailStatus:
            "FAILED",
          lastError:
            getErrorMessage(
              error,
            ),
        },
      },
    );

    throw error;
  }
}

export async function markPaymentAsPaid(
  paymentId: string,
  formData: FormData,
) {
  const payment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (!payment) {
    throw new Error(
      "El pago seleccionado no existe.",
    );
  }

  if (
    payment.status === "PAID"
  ) {
    redirect(
      "/pagos?resultado=pagado",
    );
  }

  if (
    payment.status ===
      "CANCELLED" ||
    payment.status ===
      "REFUNDED"
  ) {
    throw new Error(
      "No se puede registrar como pagado un cobro cancelado o reembolsado.",
    );
  }

  const paidAt =
    getPaymentDate(formData);

  const paymentMethod =
    getPaymentMethod(
      formData,
    );

  const paidAmount =
    getPaymentAmount(
      formData,
      payment.amount,
    );

  const externalReference =
    getOptionalString(
      formData,
      "paymentReference",
    );

  const additionalNotes =
    getOptionalString(
      formData,
      "paymentNotes",
    );

  const isTest =
    getBoolean(
      formData,
      "isTest",
    );

  const createNextRenewal =
    getBoolean(
      formData,
      "createNextRenewal",
    );

  const paymentNotes =
    appendNote(
      payment.notes,
      [
        isTest
          ? "[PRUEBA] Registro utilizado para verificar el funcionamiento del portal."
          : "Pago real registrado en el portal.",
        `Fecha de pago: ${formatDate(
          paidAt,
        )}.`,
        `Medio de pago: ${getPaymentMethodLabel(
          paymentMethod,
        )}.`,
        externalReference
          ? `Referencia bancaria o número de operación: ${externalReference}.`
          : null,
        additionalNotes
          ? `Observaciones: ${additionalNotes}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  const outcome =
    await prisma.$transaction(
      async (
        transaction,
      ) => {
        await transaction.payment.update(
          {
            where: {
              id: payment.id,
            },
            data: {
              status: "PAID",
              amount:
                paidAmount,
              paidAt,
              method:
                paymentMethod,
              notes:
                paymentNotes,
            },
          },
        );

        /*
         * Un pago de prueba se registra como
         * pagado, pero no modifica renovaciones,
         * proyectos ni suscripciones.
         */
        if (isTest) {
          return {
            isTest: true,
            renewalProcessed:
              false,
            nextRenewalCreated:
              false,
            nextRenewalAlreadyExists:
              false,
            paidWithoutRenewing:
              false,
            subscriptionId:
              null,
          };
        }

        /*
         * Un pago independiente que no nació
         * desde una renovación se cierra sin
         * realizar otras acciones.
         */
        if (
          !payment.reference?.startsWith(
            "renewal:",
          )
        ) {
          return {
            isTest: false,
            renewalProcessed:
              false,
            nextRenewalCreated:
              false,
            nextRenewalAlreadyExists:
              false,
            paidWithoutRenewing:
              false,
            subscriptionId:
              payment.subscriptionId ??
              null,
          };
        }

        const renewalId =
          payment.reference.replace(
            "renewal:",
            "",
          );

        const renewal =
          await transaction.renewal.findUnique(
            {
              where: {
                id: renewalId,
              },
              include: {
                subscription: {
                  include: {
                    client: true,
                    project: true,
                    plan: true,
                  },
                },
              },
            },
          );

        if (!renewal) {
          return {
            isTest: false,
            renewalProcessed:
              false,
            nextRenewalCreated:
              false,
            nextRenewalAlreadyExists:
              false,
            paidWithoutRenewing:
              false,
            subscriptionId:
              null,
          };
        }

        const subscription =
          renewal.subscription;

        /*
         * Permite registrar el pago y cerrar la
         * renovación sin generar un nuevo ciclo.
         */
        if (
          !createNextRenewal
        ) {
          await transaction.renewal.update(
            {
              where: {
                id: renewal.id,
              },
              data: {
                status: "PAID",
                renewedAt:
                  paidAt,
                notes: appendNote(
                  renewal.notes,
                  [
                    `Pago registrado el ${formatDate(
                      paidAt,
                    )}.`,
                    "No se creó automáticamente la siguiente renovación.",
                  ].join("\n"),
                ),
              },
            },
          );

          if (subscription) {
            await transaction.activityLog.create(
              {
                data: {
                  clientId:
                    subscription.clientId,
                  projectId:
                    subscription.projectId,
                  action:
                    "SUBSCRIPTION_PAYMENT_RECORDED",
                  entityType:
                    "Subscription",
                  entityId:
                    subscription.id,
                  description:
                    "El pago fue registrado, pero no se creó el siguiente ciclo de renovación.",
                  metadata: {
                    paymentId:
                      payment.id,
                    renewalId:
                      renewal.id,
                    paidAt:
                      paidAt.toISOString(),
                    paidAmount,
                    createNextRenewal:
                      false,
                  },
                },
              },
            );
          }

          return {
            isTest: false,
            renewalProcessed:
              true,
            nextRenewalCreated:
              false,
            nextRenewalAlreadyExists:
              false,
            paidWithoutRenewing:
              true,
            subscriptionId:
              subscription?.id ??
              null,
          };
        }

        if (
          renewal.type ===
            "SUBSCRIPTION" &&
          !subscription
        ) {
          throw new Error(
            "La renovación corresponde a una suscripción, pero el registro de la suscripción no existe.",
          );
        }

        const billingCycle =
          subscription
            ?.billingCycle as
            | BillingCycleValue
            | undefined;

        const nextDueDate =
          getNextDueDate(
            renewal.dueDate,
            billingCycle,
          );

        /*
         * La renovación anterior queda cerrada
         * como registro histórico.
         */
        await transaction.renewal.update(
          {
            where: {
              id: renewal.id,
            },
            data: {
              status:
                "RENEWED",
              renewedAt:
                paidAt,
              notes: appendNote(
                renewal.notes,
                [
                  `Renovación pagada y cerrada el ${formatDate(
                    paidAt,
                  )}.`,
                  `Próximo vencimiento calculado: ${formatDate(
                    nextDueDate,
                  )}.`,
                ].join("\n"),
              ),
            },
          },
        );

        /*
         * Hosting y dominio continúan avanzando
         * anualmente como antes.
         */
        if (
          renewal.projectId
        ) {
          if (
            renewal.type ===
            "HOSTING"
          ) {
            await transaction.project.update(
              {
                where: {
                  id:
                    renewal.projectId,
                },
                data: {
                  hostingRenewalDate:
                    nextDueDate,
                },
              },
            );
          }

          if (
            renewal.type ===
            "DOMAIN"
          ) {
            await transaction.project.update(
              {
                where: {
                  id:
                    renewal.projectId,
                },
                data: {
                  domainRenewalDate:
                    nextDueDate,
                },
              },
            );
          }
        }

        /*
         * Cuando corresponde a una suscripción:
         *
         * - avanza renewsAt según su ciclo;
         * - reinicia las solicitudes utilizadas;
         * - conserva el resto de sus datos.
         */
        if (subscription) {
          await transaction.subscription.update(
            {
              where: {
                id:
                  subscription.id,
              },
              data: {
                renewsAt:
                  nextDueDate,
                requestsUsed: 0,
              },
            },
          );

          await transaction.activityLog.create(
            {
              data: {
                clientId:
                  subscription.clientId,
                projectId:
                  subscription.projectId,
                action:
                  "SUBSCRIPTION_CYCLE_RENEWED",
                entityType:
                  "Subscription",
                entityId:
                  subscription.id,
                description: [
                  `La suscripción ${subscription.plan.name} fue renovada.`,
                  `Nuevo vencimiento: ${formatDate(
                    nextDueDate,
                  )}.`,
                  "Las solicitudes utilizadas fueron reiniciadas a cero.",
                ].join(" "),
                metadata: {
                  paymentId:
                    payment.id,
                  previousRenewalId:
                    renewal.id,
                  billingCycle:
                    subscription.billingCycle,
                  previousDueDate:
                    renewal.dueDate.toISOString(),
                  nextDueDate:
                    nextDueDate.toISOString(),
                  paidAt:
                    paidAt.toISOString(),
                  paidAmount,
                  previousRequestsUsed:
                    subscription.requestsUsed,
                  currentRequestsUsed: 0,
                },
              },
            },
          );
        }

        const {
          start:
            nextDueDateStart,
          end:
            nextDueDateEnd,
        } = getDayBounds(
          nextDueDate,
        );

        /*
         * Controla duplicados por servicio,
         * suscripción y día de vencimiento.
         */
        const existingNextRenewal =
          await transaction.renewal.findFirst(
            {
              where: {
                clientId:
                  renewal.clientId,
                projectId:
                  renewal.projectId,
                subscriptionId:
                  renewal.subscriptionId,
                type:
                  renewal.type,
                dueDate: {
                  gte:
                    nextDueDateStart,
                  lte:
                    nextDueDateEnd,
                },
                status: {
                  not:
                    "CANCELLED",
                },
              },
            },
          );

        if (
          existingNextRenewal
        ) {
          return {
            isTest: false,
            renewalProcessed:
              true,
            nextRenewalCreated:
              false,
            nextRenewalAlreadyExists:
              true,
            paidWithoutRenewing:
              false,
            subscriptionId:
              subscription?.id ??
              null,
          };
        }

        let nextRenewalAmount =
          renewal.amount ??
          paidAmount;

        let nextRenewalDescription =
          renewal.description;

        let nextRenewalNotes:
          string[];

        if (subscription) {
          const {
            netAmount,
            vatAmount,
            totalWithVat,
          } =
            calculateTotalWithVat(
              subscription.agreedPrice,
            );

          const projectReference =
            subscription
              .project?.domain ??
            subscription
              .project?.name ??
            subscription.client
              .businessName;

          nextRenewalAmount =
            totalWithVat;

          nextRenewalDescription =
            `Renovación de suscripción ${subscription.plan.name} · ${projectReference}`;

          nextRenewalNotes = [
            `Renovación creada automáticamente desde el pago registrado el ${formatDate(
              paidAt,
            )}.`,
            `Suscripción: ${subscription.id}.`,
            `Plan: ${subscription.plan.name}.`,
            `Ciclo: ${getBillingCycleLabel(
              subscription.billingCycle as BillingCycleValue,
            )}.`,
            `Monto neto: ${netAmount}.`,
            `IVA 19%: ${vatAmount}.`,
            `Total con IVA: ${totalWithVat}.`,
            `Renovación anterior: ${formatDate(
              renewal.dueDate,
            )}.`,
          ];
        } else {
          nextRenewalNotes = [
            `Renovación creada automáticamente desde el pago registrado el ${formatDate(
              paidAt,
            )}.`,
            `Renovación anterior: ${formatDate(
              renewal.dueDate,
            )}.`,
          ];
        }

        const nextRenewal =
          await transaction.renewal.create(
            {
              data: {
                clientId:
                  renewal.clientId,
                projectId:
                  renewal.projectId,
                subscriptionId:
                  renewal.subscriptionId,
                type:
                  renewal.type,
                description:
                  nextRenewalDescription,
                dueDate:
                  nextDueDate,
                amount:
                  nextRenewalAmount,
                status:
                  "UPCOMING",
                notifiedAt:
                  null,
                renewedAt:
                  null,
                notes:
                  nextRenewalNotes.join(
                    "\n",
                  ),
              },
            },
          );

        if (subscription) {
          await transaction.activityLog.create(
            {
              data: {
                clientId:
                  subscription.clientId,
                projectId:
                  subscription.projectId,
                action:
                  "SUBSCRIPTION_NEXT_RENEWAL_CREATED",
                entityType:
                  "Renewal",
                entityId:
                  nextRenewal.id,
                description:
                  `Se creó automáticamente la siguiente renovación de la suscripción ${subscription.plan.name}.`,
                metadata: {
                  subscriptionId:
                    subscription.id,
                  previousRenewalId:
                    renewal.id,
                  nextRenewalId:
                    nextRenewal.id,
                  nextDueDate:
                    nextDueDate.toISOString(),
                  amount: Number(
                    nextRenewalAmount,
                  ),
                },
              },
            },
          );
        }

        return {
          isTest: false,
          renewalProcessed:
            true,
          nextRenewalCreated:
            true,
          nextRenewalAlreadyExists:
            false,
          paidWithoutRenewing:
            false,
          subscriptionId:
            subscription?.id ??
            null,
        };
      },
    );

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath(
    "/renovaciones",
  );
  revalidatePath(
    "/suscripciones",
  );
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );
  revalidatePath(
    `/clientes/${payment.clientId}/editar`,
  );

  if (
    outcome.subscriptionId
  ) {
    revalidatePath(
      `/suscripciones/${outcome.subscriptionId}/editar`,
    );
  }

  if (outcome.isTest) {
    redirect(
      "/pagos?resultado=pagado-prueba",
    );
  }

  if (
    outcome.nextRenewalCreated
  ) {
    redirect(
      "/pagos?resultado=pagado-renovacion-creada",
    );
  }

  if (
    outcome.nextRenewalAlreadyExists
  ) {
    redirect(
      "/pagos?resultado=pagado-renovacion-existente",
    );
  }

  if (
    outcome.paidWithoutRenewing
  ) {
    redirect(
      "/pagos?resultado=pagado-sin-renovar",
    );
  }

  redirect(
    "/pagos?resultado=pagado",
  );
}

export async function cancelPayment(
  paymentId: string,
) {
  const payment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (!payment) {
    throw new Error(
      "El cobro seleccionado no existe.",
    );
  }

  if (
    payment.status !==
      "PENDING" &&
    payment.status !==
      "OVERDUE"
  ) {
    throw new Error(
      "Solo se pueden cancelar cobros pendientes o vencidos.",
    );
  }

  await prisma.payment.update({
    where: {
      id: payment.id,
    },
    data: {
      status:
        "CANCELLED",
      notes: appendNote(
        payment.notes,
        `Cobro cancelado manualmente el ${formatDate(
          new Date(),
        )}.`,
      ),
    },
  });

  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath(
    "/renovaciones",
  );
  revalidatePath(
    "/suscripciones",
  );
  revalidatePath(
    `/clientes/${payment.clientId}`,
  );

  if (
    payment.subscriptionId
  ) {
    revalidatePath(
      `/suscripciones/${payment.subscriptionId}/editar`,
    );
  }

  redirect(
    "/pagos?resultado=cancelado",
  );
}

export async function sendPaymentReceipt(
  paymentId: string,
  formData: FormData,
) {
  let result:
    | "comprobante-enviado"
    | "comprobante-error";

  try {
    const receipt =
      await createOrGetPaymentReceipt(
        paymentId,
        formData,
      );

    await deliverPaymentReceipt(
      receipt.id,
      getMoneyFromForm(
        formData,
        "receiptBalanceAmount",
        0,
      ),
    );

    result =
      "comprobante-enviado";
  } catch {
    result =
      "comprobante-error";
  }

  revalidatePath("/pagos");

  redirect(
    `/pagos?resultado=${result}`,
  );
}

export async function resendPaymentReceipt(
  paymentId: string,
) {
  let result:
    | "comprobante-reenviado"
    | "comprobante-error";

  try {
    const receipt =
      await prisma.paymentReceipt.findUnique(
        {
          where: {
            paymentId,
          },
        },
      );

    if (!receipt) {
      throw new Error(
        "Este pago todavía no tiene un comprobante emitido.",
      );
    }

    await deliverPaymentReceipt(
      receipt.id,
    );

    result =
      "comprobante-reenviado";
  } catch {
    result =
      "comprobante-error";
  }

  revalidatePath("/pagos");

  redirect(
    `/pagos?resultado=${result}`,
  );
}

export async function uploadAndSendPaymentInvoice(
  paymentId: string,
  formData: FormData,
) {
  let result:
    | "factura-enviada"
    | "factura-guardada-envio-fallido"
    | "factura-error" =
    "factura-error";

  try {
    const invoice =
      await createPaymentInvoice(
        paymentId,
        formData,
      );

    try {
      await deliverPaymentInvoice(
        invoice.id,
        getOptionalString(
          formData,
          "invoicePaymentCondition",
        ) ?? "Contado",
      );

      result =
        "factura-enviada";
    } catch {
      /*
       * El PDF permanece guardado y el error
       * queda registrado para poder reenviar
       * sin cargar otra factura.
       */
      result =
        "factura-guardada-envio-fallido";
    }
  } catch {
    result =
      "factura-error";
  }

  revalidatePath("/pagos");

  redirect(
    `/pagos?resultado=${result}`,
  );
}

export async function resendPaymentInvoice(
  paymentId: string,
) {
  let result:
    | "factura-reenviada"
    | "factura-error";

  try {
    const invoice =
      await prisma.paymentInvoice.findUnique(
        {
          where: {
            paymentId,
          },
        },
      );

    if (!invoice) {
      throw new Error(
        "Este pago todavía no tiene una factura vinculada.",
      );
    }

    await deliverPaymentInvoice(
      invoice.id,
    );

    result =
      "factura-reenviada";
  } catch {
    result =
      "factura-error";
  }

  revalidatePath("/pagos");

  redirect(
    `/pagos?resultado=${result}`,
  );
}
