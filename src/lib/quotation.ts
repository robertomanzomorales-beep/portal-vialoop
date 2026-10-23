import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { vialoopLogoPng } from "@/lib/vialoop-logo";

export type QuotationItem = {
  description: string;
  detail: string;
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
  issuedAt: string;
  validUntil: string;
  notes: string;
  senderName: string;
  senderEmail: string;
  senderRole: string;
  emailStatus: "PENDING" | "SENT" | "FAILED";
  messageId?: string;
  lastError?: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_LIMIT = 78;

const BLACK = rgb(0.04, 0.04, 0.045);
const INK = rgb(0.11, 0.11, 0.12);
const SECONDARY = rgb(0.34, 0.34, 0.36);
const MUTED = rgb(0.56, 0.56, 0.58);
const LINE = rgb(0.87, 0.87, 0.89);
const SOFT = rgb(0.965, 0.965, 0.972);
const WHITE = rgb(1, 1, 1);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQuotationMetadata(value: unknown): QuotationMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  const items = Array.isArray(value.items)
    ? value.items
        .filter(isObject)
        .map((item) => ({
          description:
            typeof item.description === "string" ? item.description : "",
          detail: typeof item.detail === "string" ? item.detail : "",
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
    contactName: typeof value.contactName === "string" ? value.contactName : "",
    recipientEmail: value.recipientEmail,
    projectName: typeof value.projectName === "string" ? value.projectName : "",
    items,
    netAmount: Number(value.netAmount) || 0,
    taxAmount: Number(value.taxAmount) || 0,
    totalAmount: Number(value.totalAmount) || 0,
    issuedAt: typeof value.issuedAt === "string" ? value.issuedAt : "",
    validUntil: typeof value.validUntil === "string" ? value.validUntil : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    senderName:
      typeof value.senderName === "string" ? value.senderName : "Vialoop Studio",
    senderEmail:
      typeof value.senderEmail === "string"
        ? value.senderEmail
        : "contacto@vialoop.cl",
    senderRole:
      typeof value.senderRole === "string" ? value.senderRole : "Gestión comercial",
    emailStatus:
      value.emailStatus === "SENT" || value.emailStatus === "FAILED"
        ? value.emailStatus
        : "PENDING",
    messageId: typeof value.messageId === "string" ? value.messageId : undefined,
    lastError: typeof value.lastError === "string" ? value.lastError : undefined,
  };
}

function safeText(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function splitLongWord(word: string, font: PDFFont, size: number, maximumWidth: number) {
  const chunks: string[] = [];
  let current = "";

  for (const character of word) {
    const candidate = `${current}${character}`;

    if (current && font.widthOfTextAtSize(candidate, size) > maximumWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function wrapText(text: string, font: PDFFont, size: number, maximumWidth: number) {
  const paragraphs = safeText(text).replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";

    for (const rawWord of words) {
      const wordParts =
        font.widthOfTextAtSize(rawWord, size) > maximumWidth
          ? splitLongWord(rawWord, font, size, maximumWidth)
          : [rawWord];

      for (const word of wordParts) {
        const candidate = current ? `${current} ${word}` : word;

        if (font.widthOfTextAtSize(candidate, size) <= maximumWidth) {
          current = candidate;
        } else {
          if (current) {
            lines.push(current);
          }
          current = word;
        }
      }
    }

    if (current) {
      lines.push(current);
    }

    if (paragraphIndex < paragraphs.length - 1) {
      lines.push("");
    }
  });

  return lines.length > 0 ? lines : [""];
}

function drawRightText(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  const normalized = safeText(text);
  page.drawText(normalized, {
    x: right - font.widthOfTextAtSize(normalized, size),
    y,
    font,
    size,
    color,
  });
}

function drawHeader(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  logo: PDFImage,
  quotation: QuotationMetadata,
) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 7,
    width: PAGE_WIDTH,
    height: 7,
    color: BLACK,
  });

  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - 86,
    width: 43,
    height: 43,
  });

  page.drawText("VIALOOP", {
    x: MARGIN + 54,
    y: PAGE_HEIGHT - 57,
    font: bold,
    size: 17,
    color: INK,
  });

  page.drawText("STUDIO SPA  /  SOLUCIONES DIGITALES", {
    x: MARGIN + 54,
    y: PAGE_HEIGHT - 73,
    font: regular,
    size: 6.8,
    color: MUTED,
  });

  drawRightText(page, "COTIZACIÓN", PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 55, bold, 14);
  drawRightText(
    page,
    quotation.number,
    PAGE_WIDTH - MARGIN,
    PAGE_HEIGHT - 73,
    regular,
    8.5,
    SECONDARY,
  );

  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 108 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 108 },
    thickness: 0.8,
    color: LINE,
  });
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 29,
    width: CONTENT_WIDTH,
    height: 29,
    color: BLACK,
  });

  const labels = [
    ["N°", MARGIN + 10],
    ["SERVICIO Y DETALLE", MARGIN + 40],
    ["CANT.", MARGIN + 309],
    ["VALOR UNIT.", MARGIN + 357],
    ["SUBTOTAL", MARGIN + 440],
  ] as const;

  labels.forEach(([label, x]) => {
    page.drawText(label, {
      x,
      y: y - 19,
      font: bold,
      size: 6.6,
      color: WHITE,
    });
  });

  return y - 29;
}

function drawFooter(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  quotation: QuotationMetadata,
  pageNumber: number,
  pageCount: number,
) {
  page.drawLine({
    start: { x: MARGIN, y: 47 },
    end: { x: PAGE_WIDTH - MARGIN, y: 47 },
    thickness: 0.7,
    color: LINE,
  });

  page.drawText("Vialoop Studio SpA", {
    x: MARGIN,
    y: 29,
    font: bold,
    size: 7.2,
    color: SECONDARY,
  });

  page.drawText(`vialoop.cl  /  ${safeText(quotation.senderEmail)}`, {
    x: MARGIN + 82,
    y: 29,
    font: regular,
    size: 7.2,
    color: MUTED,
  });

  drawRightText(
    page,
    `${pageNumber} / ${pageCount}`,
    PAGE_WIDTH - MARGIN,
    29,
    regular,
    7.2,
    MUTED,
  );
}

export async function createQuotationPdf(quotation: QuotationMetadata) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedPng(vialoopLogoPng);

  const pages: PDFPage[] = [];
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawHeader(page, bold, regular, logo, quotation);

  let y = PAGE_HEIGHT - 142;

  const addPage = (section: string, includeTableHeader = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawHeader(page, bold, regular, logo, quotation);
    y = PAGE_HEIGHT - 140;

    page.drawText(safeText(section.toUpperCase()), {
      x: MARGIN,
      y,
      font: bold,
      size: 7.3,
      color: MUTED,
    });

    y -= 21;

    if (includeTableHeader) {
      y = drawTableHeader(page, bold, y);
    }
  };

  page.drawText("PREPARADA PARA", {
    x: MARGIN,
    y,
    font: bold,
    size: 7.2,
    color: MUTED,
  });

  y -= 23;

  const clientLines = wrapText(quotation.clientName, bold, 19, 315);
  clientLines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN,
      y: y - index * 22,
      font: bold,
      size: 19,
      color: INK,
    });
  });

  const clientHeight = Math.min(clientLines.length, 2) * 22;
  y -= clientHeight + 1;

  const contactLines = wrapText(
    quotation.contactName || quotation.recipientEmail,
    regular,
    8.5,
    315,
  ).slice(0, 2);

  contactLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN,
      y: y - index * 11,
      font: regular,
      size: 8.5,
      color: SECONDARY,
    });
  });

  const metaX = 392;
  page.drawText("FECHA DE EMISIÓN", {
    x: metaX,
    y: PAGE_HEIGHT - 145,
    font: bold,
    size: 6.5,
    color: MUTED,
  });
  page.drawText(formatDate(quotation.issuedAt), {
    x: metaX,
    y: PAGE_HEIGHT - 160,
    font: regular,
    size: 8.2,
    color: INK,
  });
  page.drawText("VIGENCIA", {
    x: metaX,
    y: PAGE_HEIGHT - 187,
    font: bold,
    size: 6.5,
    color: MUTED,
  });
  page.drawText(`Hasta ${safeText(formatDate(quotation.validUntil))}`, {
    x: metaX,
    y: PAGE_HEIGHT - 202,
    font: regular,
    size: 8.2,
    color: INK,
  });

  y -= 34 + Math.max(0, contactLines.length - 1) * 11;

  if (quotation.projectName) {
    const projectLines = wrapText(
      quotation.projectName,
      bold,
      10.5,
      CONTENT_WIDTH - 26,
    ).slice(0, 2);
    const projectPanelHeight = 45 + Math.max(0, projectLines.length - 1) * 13;

    page.drawRectangle({
      x: MARGIN,
      y: y - projectPanelHeight,
      width: CONTENT_WIDTH,
      height: projectPanelHeight,
      color: SOFT,
    });
    page.drawText("PROYECTO / PROPUESTA", {
      x: MARGIN + 13,
      y: y - 15,
      font: bold,
      size: 6.5,
      color: MUTED,
    });
    projectLines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + 13,
        y: y - 33 - index * 13,
        font: bold,
        size: 10.5,
        color: INK,
      });
    });
    y -= projectPanelHeight + 20;
  }

  y = drawTableHeader(page, bold, y);

  quotation.items.forEach((item, itemIndex) => {
    const titleLines = wrapText(item.description, bold, 8.7, 252);
    const detailLines = item.detail
      ? wrapText(item.detail, regular, 7.8, 252)
      : [];
    const textHeight = titleLines.length * 10.7 + detailLines.length * 9.5;
    const detailGap = detailLines.length > 0 ? 4 : 0;
    const rowHeight = Math.max(42, textHeight + detailGap + 18);

    if (y - rowHeight < FOOTER_LIMIT + 20) {
      addPage("Detalle de servicios - continuación", true);
    }

    if (itemIndex % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.987, 0.987, 0.99),
      });
    }

    page.drawText(String(itemIndex + 1).padStart(2, "0"), {
      x: MARGIN + 10,
      y: y - 18,
      font: bold,
      size: 7.5,
      color: MUTED,
    });

    let textY = y - 17;
    titleLines.forEach((line) => {
      page.drawText(line, {
        x: MARGIN + 40,
        y: textY,
        font: bold,
        size: 8.7,
        color: INK,
      });
      textY -= 10.7;
    });

    if (detailLines.length > 0) {
      textY -= 2;
      detailLines.forEach((line) => {
        page.drawText(line, {
          x: MARGIN + 40,
          y: textY,
          font: regular,
          size: 7.8,
          color: SECONDARY,
        });
        textY -= 9.5;
      });
    }

    page.drawText(String(item.quantity), {
      x: MARGIN + 320,
      y: y - 18,
      font: regular,
      size: 8,
      color: SECONDARY,
    });

    drawRightText(
      page,
      formatCurrency(item.unitPrice),
      MARGIN + 430,
      y - 18,
      regular,
      8,
      SECONDARY,
    );
    drawRightText(
      page,
      formatCurrency(item.quantity * item.unitPrice),
      PAGE_WIDTH - MARGIN - 10,
      y - 18,
      bold,
      8.2,
      INK,
    );

    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight },
      end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight },
      thickness: 0.6,
      color: LINE,
    });

    y -= rowHeight;
  });

  const notesLines = wrapText(quotation.notes, regular, 8.2, CONTENT_WIDTH - 28);
  const summaryHeight = 114;
  const firstNotesHeight = Math.min(notesLines.length, 10) * 10.5 + 49;

  if (y - summaryHeight - firstNotesHeight < FOOTER_LIMIT) {
    addPage("Resumen y condiciones");
  } else {
    y -= 24;
  }

  const summaryX = PAGE_WIDTH - MARGIN - 220;
  const summaryWidth = 220;

  const rows = [
    ["Neto", quotation.netAmount],
    ["IVA 19%", quotation.taxAmount],
  ] as const;

  rows.forEach(([label, value], index) => {
    const rowY = y - index * 25;
    page.drawText(label, {
      x: summaryX,
      y: rowY,
      font: regular,
      size: 8.3,
      color: SECONDARY,
    });
    drawRightText(page, formatCurrency(value), summaryX + summaryWidth, rowY, bold, 8.5);
  });

  const totalY = y - 64;
  page.drawRectangle({
    x: summaryX - 10,
    y: totalY - 10,
    width: summaryWidth + 10,
    height: 33,
    color: BLACK,
  });
  page.drawText("TOTAL", {
    x: summaryX,
    y: totalY,
    font: bold,
    size: 8.5,
    color: WHITE,
  });
  drawRightText(
    page,
    formatCurrency(quotation.totalAmount),
    summaryX + summaryWidth,
    totalY - 1,
    bold,
    13,
    WHITE,
  );

  y -= summaryHeight;

  let remainingNotes = notesLines;
  let firstNotesBlock = true;

  while (remainingNotes.length > 0) {
    const availableLines = Math.max(
      1,
      Math.floor((y - FOOTER_LIMIT - 45) / 10.5),
    );

    if (availableLines < 3 && !firstNotesBlock) {
      addPage("Condiciones comerciales");
      continue;
    }

    const currentLines = remainingNotes.slice(0, availableLines);
    remainingNotes = remainingNotes.slice(currentLines.length);

    page.drawText(firstNotesBlock ? "CONDICIONES COMERCIALES" : "CONTINUACIÓN", {
      x: MARGIN,
      y,
      font: bold,
      size: 7,
      color: MUTED,
    });

    const panelHeight = currentLines.length * 10.5 + 28;
    page.drawRectangle({
      x: MARGIN,
      y: y - panelHeight - 11,
      width: CONTENT_WIDTH,
      height: panelHeight,
      color: SOFT,
    });

    currentLines.forEach((line, index) => {
      page.drawText(line || " ", {
        x: MARGIN + 14,
        y: y - 29 - index * 10.5,
        font: regular,
        size: 8.2,
        color: SECONDARY,
      });
    });

    y -= panelHeight + 25;
    firstNotesBlock = false;

    if (remainingNotes.length > 0) {
      addPage("Condiciones comerciales");
    }
  }

  if (y < 145) {
    addPage("Contacto comercial");
  }

  page.drawLine({
    start: { x: MARGIN, y: y - 2 },
    end: { x: MARGIN + 64, y: y - 2 },
    thickness: 2,
    color: BLACK,
  });
  page.drawText(safeText(quotation.senderName), {
    x: MARGIN,
    y: y - 23,
    font: bold,
    size: 9.2,
    color: INK,
  });
  page.drawText(safeText(quotation.senderRole), {
    x: MARGIN,
    y: y - 38,
    font: regular,
    size: 7.5,
    color: SECONDARY,
  });
  page.drawText(safeText(quotation.senderEmail), {
    x: MARGIN,
    y: y - 52,
    font: regular,
    size: 7.5,
    color: MUTED,
  });

  page.drawText("PROPUESTA COMERCIAL", {
    x: PAGE_WIDTH - MARGIN - 130,
    y: y - 23,
    font: bold,
    size: 7.2,
    color: MUTED,
  });
  drawRightText(
    page,
    quotation.number,
    PAGE_WIDTH - MARGIN,
    y - 40,
    bold,
    9.5,
    INK,
  );

  pages.forEach((currentPage, index) => {
    drawFooter(
      currentPage,
      regular,
      bold,
      quotation,
      index + 1,
      pages.length,
    );
  });

  return Buffer.from(await document.save());
}
