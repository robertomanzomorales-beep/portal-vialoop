"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import {
  buildInvoiceEmail,
  buildPaymentReceiptEmail,
} from "@/lib/payment-email-templates";

export type FinancialActionState = {
  ok: boolean;
  message: string;
};

type PaymentMethodValue =
  | "BANK_TRANSFER"
  | "FLOW"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

const EMPTY_STATE: FinancialActionState = {
  ok: false,
  message: "",
};

function text(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, field: string) {
  return text(formData, field) || null;
}

function validEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("Ingresa un correo válido.");
  }

  return value;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("La fecha ingresada no es válida.");
  }

  const date = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha ingresada no es válida.");
  }

  return date;
}

function parseMoney(value: string, allowZero = false) {
  const amount = Number(value.replace(/[^\d]/g, ""));

  if (
    !Number.isFinite(amount) ||
    (allowZero ? amount < 0 : amount <= 0)
  ) {
    throw new Error("Ingresa un monto válido.");
  }

  return Math.round(amount);
}

function paymentMethod(value: string): PaymentMethodValue {
  const methods: PaymentMethodValue[] = [
    "BANK_TRANSFER",
    "FLOW",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "CASH",
    "OTHER",
  ];

  return methods.includes(value as PaymentMethodValue)
    ? (value as PaymentMethodValue)
    : "BANK_TRANSFER";
}

function grossFromNet(netAmount: unknown) {
  const net = Math.round(Number(netAmount));
  return net + Math.round(net * 0.19);
}

function amountsFromTotal(totalAmount: number) {
  const netAmount = Math.round(totalAmount / 1.19);

  return {
    netAmount,
    taxAmount: totalAmount - netAmount,
    totalAmount,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No fue posible completar la operación.";
}

function paymentsEmail() {
  return (
    process.env.PAYMENTS_SMTP_FROM_EMAIL?.trim() ||
    process.env.PAYMENTS_SMTP_USER?.trim() ||
    "pagos@vialoop.cl"
  );
}

function billingEmail() {
  return (
    process.env.BILLING_SMTP_FROM_EMAIL?.trim() ||
    process.env.BILLING_SMTP_USER?.trim() ||
    "facturacion@vialoop.cl"
  );
}

function invoiceFile(formData: FormData) {
  const value = formData.get("invoiceFile");

  if (!(value instanceof File) || value.size <= 0) {
    throw new Error("Selecciona la factura en formato PDF.");
  }

  if (
    value.type !== "application/pdf" &&
    !value.name.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("El archivo seleccionado debe ser un PDF.");
  }

  if (value.size > 5 * 1024 * 1024) {
    throw new Error("La factura no puede superar los 5 MB.");
  }

  return value;
}

async function saleBalance(saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      netAmount: true,
      status: true,
      payments: {
        select: { amount: true },
      },
    },
  });

  if (!sale) {
    throw new Error("La venta seleccionada ya no existe.");
  }

  const total = grossFromNet(sale.netAmount);
  const paid = sale.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  return {
    sale,
    total,
    paid,
    balance: Math.max(total - paid, 0),
  };
}

export async function registerSalePayment(
  saleId: string,
  _previousState: FinancialActionState = EMPTY_STATE,
  formData: FormData,
): Promise<FinancialActionState> {
  try {
    const amount = parseMoney(text(formData, "amount"));
    const paidAt = parseDate(text(formData, "paidAt"));
    const method = paymentMethod(text(formData, "method"));
    const reference = optionalText(formData, "reference");
    const notes = optionalText(formData, "notes");
    const summary = await saleBalance(saleId);

    if (summary.sale.status !== "ACTIVE") {
      throw new Error("No se pueden registrar pagos en una venta anulada.");
    }

    if (summary.balance <= 0) {
      throw new Error("La venta ya se encuentra pagada.");
    }

    if (amount > summary.balance) {
      throw new Error(
        `El abono supera el saldo pendiente de $${summary.balance.toLocaleString(
          "es-CL",
        )}.`,
      );
    }

    const payment = await prisma.salePayment.create({
      data: {
        saleId,
        amount,
        paidAt,
        method,
        reference,
        notes,
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: (
          await prisma.sale.findUniqueOrThrow({
            where: { id: saleId },
            select: { clientId: true },
          })
        ).clientId,
        action: "SALE_PAYMENT_REGISTERED",
        entityType: "SalePayment",
        entityId: payment.id,
        description: "Se registró un abono manual asociado a una venta.",
        metadata: {
          saleId,
          amount,
          method,
          reference,
        },
      },
    });

    revalidatePath("/");
    revalidatePath("/ventas");
    revalidatePath("/cobros");

    return {
      ok: true,
      message: "Pago registrado correctamente.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

async function createOrUpdateReceipt(
  salePaymentId: string,
  formData: FormData,
) {
  const payment = await prisma.salePayment.findUnique({
    where: { id: salePaymentId },
    include: {
      receipt: true,
      sale: {
        include: {
          client: true,
          payments: {
            select: { amount: true },
          },
        },
      },
    },
  });

  if (!payment) {
    throw new Error("El pago seleccionado ya no existe.");
  }

  const recipientName =
    text(formData, "recipientName") ||
    payment.sale.client.mainContactName ||
    payment.sale.client.businessName;
  const recipientEmail = validEmail(
    text(formData, "recipientEmail") ||
      payment.sale.client.email ||
      "",
  );
  const serviceDescription =
    text(formData, "serviceDescription") || payment.sale.service;
  const projectReference = optionalText(formData, "projectReference");
  const paymentReference =
    optionalText(formData, "paymentReference") || payment.reference;
  const totals = amountsFromTotal(Number(payment.amount));
  const netAmount = text(formData, "netAmount")
    ? parseMoney(text(formData, "netAmount"), true)
    : totals.netAmount;
  const taxAmount = text(formData, "taxAmount")
    ? parseMoney(text(formData, "taxAmount"), true)
    : totals.taxAmount;
  const totalAmount = text(formData, "totalAmount")
    ? parseMoney(text(formData, "totalAmount"))
    : totals.totalAmount;
  const totalSale = grossFromNet(payment.sale.netAmount);
  const totalPaid = payment.sale.payments.reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  );
  const balanceAmount = Math.max(totalSale - totalPaid, 0);

  if (payment.receipt) {
    const email = buildPaymentReceiptEmail({
      number: payment.receipt.number,
      recipientName,
      serviceDescription,
      projectReference,
      coveragePeriod: null,
      paidAt: payment.paidAt,
      paymentMethod: payment.method as PaymentMethodValue,
      paymentReference,
      netAmount,
      taxAmount,
      totalAmount,
      balanceAmount,
    });

    return prisma.salePaymentReceipt.update({
      where: { id: payment.receipt.id },
      data: {
        recipientName,
        recipientEmail,
        serviceDescription,
        projectReference,
        paidAt: payment.paidAt,
        paymentMethod: payment.method,
        paymentReference,
        netAmount,
        taxAmount,
        totalAmount,
        balanceAmount,
        subject: email.subject,
      },
    });
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.salePaymentReceipt.findUnique({
      where: { salePaymentId },
    });

    if (existing) {
      return existing;
    }

    const counter = await transaction.counter.upsert({
      where: { key: "payment-receipt-number" },
      create: {
        key: "payment-receipt-number",
        nextValue: 300,
      },
      update: {
        nextValue: {
          increment: 1,
        },
      },
    });

    const email = buildPaymentReceiptEmail({
      number: counter.nextValue,
      recipientName,
      serviceDescription,
      projectReference,
      coveragePeriod: null,
      paidAt: payment.paidAt,
      paymentMethod: payment.method as PaymentMethodValue,
      paymentReference,
      netAmount,
      taxAmount,
      totalAmount,
      balanceAmount,
    });

    return transaction.salePaymentReceipt.create({
      data: {
        salePaymentId,
        number: counter.nextValue,
        recipientName,
        recipientEmail,
        serviceDescription,
        projectReference,
        paidAt: payment.paidAt,
        paymentMethod: payment.method,
        paymentReference,
        netAmount,
        taxAmount,
        totalAmount,
        balanceAmount,
        subject: email.subject,
      },
    });
  });
}

async function deliverReceipt(receiptId: string) {
  const receipt = await prisma.salePaymentReceipt.findUnique({
    where: { id: receiptId },
  });

  if (!receipt) {
    throw new Error("El recibo seleccionado ya no existe.");
  }

  await prisma.salePaymentReceipt.update({
    where: { id: receipt.id },
    data: {
      emailStatus: "PENDING",
      sendAttempts: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });

  const email = buildPaymentReceiptEmail({
    number: receipt.number,
    recipientName: receipt.recipientName,
    serviceDescription: receipt.serviceDescription,
    projectReference: receipt.projectReference,
    coveragePeriod: null,
    paidAt: receipt.paidAt,
    paymentMethod: receipt.paymentMethod as PaymentMethodValue,
    paymentReference: receipt.paymentReference,
    netAmount: Number(receipt.netAmount),
    taxAmount: Number(receipt.taxAmount),
    totalAmount: Number(receipt.totalAmount),
    balanceAmount: Number(receipt.balanceAmount),
  });

  try {
    const result = await sendEmail({
      mailAccount: "payments",
      to: receipt.recipientEmail,
      subject: receipt.subject,
      text: email.text,
      html: email.html,
      fromEmail: paymentsEmail(),
      fromName: "Pagos Vialoop",
      replyTo: paymentsEmail(),
    });

    await prisma.salePaymentReceipt.update({
      where: { id: receipt.id },
      data: {
        emailStatus: "SENT",
        sentAt: new Date(),
        messageId: result.messageId,
        lastError: null,
      },
    });
  } catch (error) {
    await prisma.salePaymentReceipt.update({
      where: { id: receipt.id },
      data: {
        emailStatus: "FAILED",
        lastError: errorMessage(error).slice(0, 4000),
      },
    });

    throw error;
  }
}

export async function sendSalePaymentReceipt(
  salePaymentId: string,
  _previousState: FinancialActionState = EMPTY_STATE,
  formData: FormData,
): Promise<FinancialActionState> {
  try {
    const receipt = await createOrUpdateReceipt(salePaymentId, formData);
    await deliverReceipt(receipt.id);
    revalidatePath("/ventas");

    return {
      ok: true,
      message: `Recibo N.º ${String(receipt.number).padStart(
        4,
        "0",
      )} enviado correctamente.`,
    };
  } catch (error) {
    revalidatePath("/ventas");

    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

async function createInvoice(salePaymentId: string, formData: FormData) {
  const payment = await prisma.salePayment.findUnique({
    where: { id: salePaymentId },
    include: {
      invoice: true,
      sale: {
        include: {
          client: true,
        },
      },
    },
  });

  if (!payment) {
    throw new Error("El pago seleccionado ya no existe.");
  }

  if (payment.invoice) {
    throw new Error(
      "Este pago ya tiene una factura. Utiliza Reenviar factura.",
    );
  }

  const invoiceNumber = text(formData, "invoiceNumber");

  if (!invoiceNumber) {
    throw new Error("Ingresa el número de la factura.");
  }

  const duplicate = await Promise.all([
    prisma.paymentInvoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    }),
    prisma.salePaymentInvoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    }),
  ]);

  if (duplicate.some(Boolean)) {
    throw new Error("Ese número de factura ya está registrado.");
  }

  const file = invoiceFile(formData);
  const fileData = Buffer.from(await file.arrayBuffer());
  const issueDate = parseDate(text(formData, "issueDate"));
  const recipientName =
    text(formData, "recipientName") ||
    payment.sale.client.mainContactName ||
    payment.sale.client.businessName;
  const recipientEmail = validEmail(
    text(formData, "recipientEmail") ||
      payment.sale.client.email ||
      "",
  );
  const serviceDescription =
    text(formData, "serviceDescription") || payment.sale.service;
  const paymentCondition =
    text(formData, "paymentCondition") || "Contado";
  const defaults = amountsFromTotal(Number(payment.amount));
  const netAmount = text(formData, "netAmount")
    ? parseMoney(text(formData, "netAmount"), true)
    : defaults.netAmount;
  const taxAmount = text(formData, "taxAmount")
    ? parseMoney(text(formData, "taxAmount"), true)
    : defaults.taxAmount;
  const totalAmount = text(formData, "totalAmount")
    ? parseMoney(text(formData, "totalAmount"))
    : defaults.totalAmount;
  const email = buildInvoiceEmail({
    invoiceNumber,
    recipientName,
    issueDate,
    serviceDescription,
    netAmount,
    taxAmount,
    totalAmount,
    paymentCondition,
    fileName: file.name,
  });

  return prisma.salePaymentInvoice.create({
    data: {
      salePaymentId,
      invoiceNumber,
      issueDate,
      recipientName,
      recipientEmail,
      serviceDescription,
      netAmount,
      taxAmount,
      totalAmount,
      paymentCondition,
      fileName: file.name,
      mimeType: "application/pdf",
      fileSize: file.size,
      fileData,
      subject: email.subject,
    },
  });
}

async function deliverInvoice(invoiceId: string) {
  const invoice = await prisma.salePaymentInvoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw new Error("La factura seleccionada ya no existe.");
  }

  await prisma.salePaymentInvoice.update({
    where: { id: invoice.id },
    data: {
      emailStatus: "PENDING",
      sendAttempts: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });

  const email = buildInvoiceEmail({
    invoiceNumber: invoice.invoiceNumber,
    recipientName: invoice.recipientName,
    issueDate: invoice.issueDate,
    serviceDescription: invoice.serviceDescription,
    netAmount: Number(invoice.netAmount),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    paymentCondition: invoice.paymentCondition || "Contado",
    fileName: invoice.fileName,
  });

  try {
    const result = await sendEmail({
      mailAccount: "billing",
      to: invoice.recipientEmail,
      subject: invoice.subject,
      text: email.text,
      html: email.html,
      fromEmail: billingEmail(),
      fromName: "Facturación Vialoop",
      replyTo: billingEmail(),
      attachments: [
        {
          filename: invoice.fileName,
          content: invoice.fileData,
          contentType: invoice.mimeType,
        },
      ],
    });

    await prisma.salePaymentInvoice.update({
      where: { id: invoice.id },
      data: {
        emailStatus: "SENT",
        sentAt: new Date(),
        messageId: result.messageId,
        lastError: null,
      },
    });
  } catch (error) {
    await prisma.salePaymentInvoice.update({
      where: { id: invoice.id },
      data: {
        emailStatus: "FAILED",
        lastError: errorMessage(error).slice(0, 4000),
      },
    });

    throw error;
  }
}

export async function uploadAndSendSalePaymentInvoice(
  salePaymentId: string,
  _previousState: FinancialActionState = EMPTY_STATE,
  formData: FormData,
): Promise<FinancialActionState> {
  try {
    const invoice = await createInvoice(salePaymentId, formData);

    try {
      await deliverInvoice(invoice.id);

      return {
        ok: true,
        message: `Factura ${invoice.invoiceNumber} enviada correctamente.`,
      };
    } catch {
      return {
        ok: false,
        message:
          "La factura quedó guardada, pero el correo no pudo enviarse. Puedes reenviarla sin cargar el PDF nuevamente.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  } finally {
    revalidatePath("/ventas");
  }
}

export async function resendSalePaymentInvoice(
  salePaymentId: string,
  _previousState: FinancialActionState = EMPTY_STATE,
  _formData: FormData,
): Promise<FinancialActionState> {
  try {
    const invoice = await prisma.salePaymentInvoice.findUnique({
      where: { salePaymentId },
    });

    if (!invoice) {
      throw new Error("Este pago todavía no tiene una factura vinculada.");
    }

    await deliverInvoice(invoice.id);
    revalidatePath("/ventas");

    return {
      ok: true,
      message: `Factura ${invoice.invoiceNumber} reenviada correctamente.`,
    };
  } catch (error) {
    revalidatePath("/ventas");

    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}
