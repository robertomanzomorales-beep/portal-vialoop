import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import { vialoopLogoPng } from "@/lib/vialoop-logo";

export type QuotationItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type QuotationMetadata = {
  number: string;
  clientId: string;
  clientName: string;
  contactName: string;
  recipientEmail: string;
  projectName: string;
  items: QuotationItem[];
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  validUntil: string;
  notes: string;
  senderName: string;
  senderEmail: string;
  senderRole: string;
  emailStatus: "PENDING" | "SENT" | "FAILED";
  messageId?: string;
  lastError?: string;
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function parseQuotationMetadata(
  value: unknown,
): QuotationMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  const items = Array.isArray(value.items)
    ? value.items
        .filter(isObject)
        .map((item) => ({
          description:
            typeof item.description === "string"
              ? item.description
              : "",
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        }))
        .filter(
          (item) =>
            item.description &&
            Number.isFinite(item.quantity) &&
            Number.isFinite(item.unitPrice),
        )
    : [];

  if (
    typeof value.number !== "string" ||
    typeof value.clientId !== "string" ||
    typeof value.clientName !== "string" ||
    typeof value.recipientEmail !== "string" ||
    items.length === 0
  ) {
    return null;
  }

  return {
    number: value.number,
    clientId: value.clientId,
    clientName: value.clientName,
    contactName:
      typeof value.contactName === "string"
        ? value.contactName
        : "",
    recipientEmail: value.recipientEmail,
    projectName:
      typeof value.projectName === "string"
        ? value.projectName
        : "",
    items,
    netAmount: Number(value.netAmount) || 0,
    taxAmount: Number(value.taxAmount) || 0,
    totalAmount: Number(value.totalAmount) || 0,
    validUntil:
      typeof value.validUntil === "string"
        ? value.validUntil
        : "",
    notes:
      typeof value.notes === "string"
        ? value.notes
        : "",
    senderName:
      typeof value.senderName === "string"
        ? value.senderName
        : "Vialoop Studio",
    senderEmail:
      typeof value.senderEmail === "string"
        ? value.senderEmail
        : "contacto@vialoop.cl",
    senderRole:
      typeof value.senderRole === "string"
        ? value.senderRole
        : "Gestión comercial",
    emailStatus:
      value.emailStatus === "SENT" ||
      value.emailStatus === "FAILED"
        ? value.emailStatus
        : "PENDING",
    messageId:
      typeof value.messageId === "string"
        ? value.messageId
        : undefined,
    lastError:
      typeof value.lastError === "string"
        ? value.lastError
        : undefined,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maximumWidth: number,
) {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current
      ? `${current} ${word}`
      : word;

    if (
      font.widthOfTextAtSize(
        candidate,
        size,
      ) <= maximumWidth
    ) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0
    ? lines
    : [""];
}

function drawHeader(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  logo: PDFImage,
  quotation: QuotationMetadata,
) {
  const { width, height } =
    page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - 132,
    width,
    height: 132,
    color: rgb(0.055, 0.075, 0.11),
  });

  page.drawImage(logo, {
    x: 48,
    y: height - 101,
    width: 52,
    height: 52,
  });

  page.drawText("VIALOOP STUDIO", {
    x: 112,
    y: height - 54,
    font: bold,
    size: 20,
    color: rgb(1, 1, 1),
  });

  page.drawText(
    "DISEÑO WEB  ·  SISTEMAS  ·  HOSTING",
    {
      x: 112,
      y: height - 76,
      font: regular,
      size: 8,
      color: rgb(0.72, 0.77, 0.85),
    },
  );

  page.drawText("COTIZACIÓN", {
    x: width - 196,
    y: height - 54,
    font: bold,
    size: 17,
    color: rgb(1, 1, 1),
  });

  page.drawText(quotation.number, {
    x: width - 196,
    y: height - 78,
    font: regular,
    size: 9,
    color: rgb(0.72, 0.77, 0.85),
  });

  page.drawText(
    `Válida hasta ${formatDate(
      quotation.validUntil,
    )}`,
    {
      x: width - 196,
      y: height - 96,
      font: regular,
      size: 8,
      color: rgb(0.72, 0.77, 0.85),
    },
  );
}

function drawFooter(
  page: PDFPage,
  regular: PDFFont,
  quotation: QuotationMetadata,
) {
  const { width } = page.getSize();

  page.drawLine({
    start: { x: 48, y: 42 },
    end: { x: width - 48, y: 42 },
    thickness: 0.7,
    color: rgb(0.86, 0.88, 0.91),
  });

  page.drawText(
    `Vialoop Studio SpA  ·  vialoop.cl  ·  ${quotation.senderEmail}`,
    {
      x: 48,
      y: 25,
      font: regular,
      size: 7.5,
      color: rgb(0.39, 0.44, 0.52),
    },
  );
}

export async function createQuotationPdf(
  quotation: QuotationMetadata,
) {
  const document =
    await PDFDocument.create();

  const regular =
    await document.embedFont(
      StandardFonts.Helvetica,
    );

  const bold =
    await document.embedFont(
      StandardFonts.HelveticaBold,
    );

  const logo =
    await document.embedPng(
      vialoopLogoPng,
    );

  let page = document.addPage([
    595.28,
    841.89,
  ]);

  drawHeader(
    page,
    bold,
    regular,
    logo,
    quotation,
  );

  let y = 670;

  const newPage = () => {
    drawFooter(
      page,
      regular,
      quotation,
    );

    page = document.addPage([
      595.28,
      841.89,
    ]);

    drawHeader(
      page,
      bold,
      regular,
      logo,
      quotation,
    );

    y = 670;
  };

  page.drawText("PREPARADA PARA", {
    x: 48,
    y,
    font: bold,
    size: 8,
    color: rgb(0.16, 0.36, 0.72),
  });

  y -= 24;

  page.drawText(quotation.clientName, {
    x: 48,
    y,
    font: bold,
    size: 20,
    color: rgb(0.06, 0.09, 0.14),
  });

  y -= 20;

  page.drawText(
    quotation.contactName ||
      quotation.recipientEmail,
    {
      x: 48,
      y,
      font: regular,
      size: 9,
      color: rgb(0.39, 0.44, 0.52),
    },
  );

  y -= 36;

  if (quotation.projectName) {
    page.drawText(
      quotation.projectName,
      {
        x: 48,
        y,
        font: bold,
        size: 12,
        color: rgb(0.06, 0.09, 0.14),
      },
    );

    y -= 26;
  }

  const tableX = 48;
  const tableWidth = 499;

  page.drawRectangle({
    x: tableX,
    y: y - 26,
    width: tableWidth,
    height: 26,
    color: rgb(0.95, 0.96, 0.98),
  });

  page.drawText("SERVICIO", {
    x: tableX + 12,
    y: y - 17,
    font: bold,
    size: 7.5,
    color: rgb(0.26, 0.31, 0.39),
  });

  page.drawText("CANT.", {
    x: tableX + 336,
    y: y - 17,
    font: bold,
    size: 7.5,
    color: rgb(0.26, 0.31, 0.39),
  });

  page.drawText("TOTAL NETO", {
    x: tableX + 405,
    y: y - 17,
    font: bold,
    size: 7.5,
    color: rgb(0.26, 0.31, 0.39),
  });

  y -= 40;

  for (const item of quotation.items) {
    const lines = wrapText(
      item.description,
      regular,
      9,
      300,
    );

    const rowHeight = Math.max(
      34,
      lines.length * 12 + 16,
    );

    if (y - rowHeight < 115) {
      newPage();
    }

    page.drawLine({
      start: {
        x: tableX,
        y: y - rowHeight,
      },
      end: {
        x: tableX + tableWidth,
        y: y - rowHeight,
      },
      thickness: 0.6,
      color: rgb(0.89, 0.9, 0.93),
    });

    lines.forEach((line, index) => {
      page.drawText(line, {
        x: tableX + 12,
        y: y - 14 - index * 12,
        font: regular,
        size: 9,
        color: rgb(0.18, 0.22, 0.29),
      });
    });

    page.drawText(
      String(item.quantity),
      {
        x: tableX + 345,
        y: y - 14,
        font: regular,
        size: 9,
        color: rgb(0.18, 0.22, 0.29),
      },
    );

    const lineTotal =
      item.quantity *
      item.unitPrice;

    page.drawText(
      formatCurrency(lineTotal),
      {
        x: tableX + 405,
        y: y - 14,
        font: bold,
        size: 9,
        color: rgb(0.06, 0.09, 0.14),
      },
    );

    y -= rowHeight;
  }

  if (y < 210) {
    newPage();
  }

  y -= 26;

  const summaryX = 342;

  const summaryRows = [
    ["Neto", quotation.netAmount],
    ["IVA 19%", quotation.taxAmount],
    ["Total", quotation.totalAmount],
  ] as const;

  summaryRows.forEach(
    ([label, value], index) => {
      const rowY = y - index * 26;

      if (index === 2) {
        page.drawRectangle({
          x: summaryX - 10,
          y: rowY - 8,
          width: 215,
          height: 25,
          color: rgb(0.93, 0.95, 1),
        });
      }

      page.drawText(label, {
        x: summaryX,
        y: rowY,
        font: index === 2 ? bold : regular,
        size: index === 2 ? 10 : 9,
        color: rgb(0.26, 0.31, 0.39),
      });

      page.drawText(
        formatCurrency(value),
        {
          x: summaryX + 93,
          y: rowY,
          font: bold,
          size: index === 2 ? 11 : 9,
          color: rgb(0.06, 0.09, 0.14),
        },
      );
    },
  );

  y -= 105;

  if (quotation.notes) {
    page.drawText("CONDICIONES", {
      x: 48,
      y,
      font: bold,
      size: 8,
      color: rgb(0.16, 0.36, 0.72),
    });

    y -= 18;

    const noteLines = wrapText(
      quotation.notes,
      regular,
      8.5,
      490,
    );

    noteLines.slice(0, 8).forEach(
      (line, index) => {
        page.drawText(line, {
          x: 48,
          y: y - index * 12,
          font: regular,
          size: 8.5,
          color: rgb(0.32, 0.37, 0.45),
        });
      },
    );
  }

  drawFooter(
    page,
    regular,
    quotation,
  );

  return Buffer.from(
    await document.save(),
  );
}
