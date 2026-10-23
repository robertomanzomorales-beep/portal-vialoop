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
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_LIMIT = 68;

const BLACK = rgb(0.045, 0.045, 0.052);
const INK = rgb(0.11, 0.11, 0.12);
const SECONDARY = rgb(0.34, 0.34, 0.36);
const MUTED = rgb(0.55, 0.55, 0.58);
const LINE = rgb(0.88, 0.88, 0.9);
const SOFT = rgb(0.968, 0.968, 0.975);
const SOFT_DEEP = rgb(0.935, 0.935, 0.945);
const WHITE = rgb(1, 1, 1);

type PdfColor = ReturnType<typeof rgb>;

type RoundedRectangleOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: PdfColor;
  borderColor?: PdfColor;
  borderWidth?: number;
};

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

function fillRoundedRectangle(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: PdfColor,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

  if (safeRadius === 0) {
    page.drawRectangle({ x, y, width, height, color });
    return;
  }

  page.drawRectangle({
    x: x + safeRadius,
    y,
    width: width - safeRadius * 2,
    height,
    color,
  });
  page.drawRectangle({
    x,
    y: y + safeRadius,
    width,
    height: height - safeRadius * 2,
    color,
  });

  const corners = [
    [x + safeRadius, y + safeRadius],
    [x + width - safeRadius, y + safeRadius],
    [x + safeRadius, y + height - safeRadius],
    [x + width - safeRadius, y + height - safeRadius],
  ] as const;

  corners.forEach(([centerX, centerY]) => {
    page.drawEllipse({
      x: centerX,
      y: centerY,
      xScale: safeRadius,
      yScale: safeRadius,
      color,
    });
  });
}

function drawRoundedRectangle(
  page: PDFPage,
  {
    x,
    y,
    width,
    height,
    radius,
    color,
    borderColor,
    borderWidth = 0,
  }: RoundedRectangleOptions,
) {
  if (borderColor && borderWidth > 0) {
    fillRoundedRectangle(page, x, y, width, height, radius, borderColor);
    fillRoundedRectangle(
      page,
      x + borderWidth,
      y + borderWidth,
      width - borderWidth * 2,
      height - borderWidth * 2,
      Math.max(0, radius - borderWidth),
      color,
    );
    return;
  }

  fillRoundedRectangle(page, x, y, width, height, radius, color);
}

function splitLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maximumWidth: number,
) {
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

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maximumWidth: number,
) {
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

function drawCenteredText(
  page: PDFPage,
  text: string,
  center: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  const normalized = safeText(text);
  page.drawText(normalized, {
    x: center - font.widthOfTextAtSize(normalized, size) / 2,
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
    y: PAGE_HEIGHT - 5,
    width: PAGE_WIDTH,
    height: 5,
    color: BLACK,
  });

  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - 92,
    width: 50,
    height: 50,
  });

  page.drawText("Vialoop", {
    x: MARGIN + 62,
    y: PAGE_HEIGHT - 63,
    font: bold,
    size: 18,
    color: INK,
  });

  page.drawText("STUDIO SPA  /  SOLUCIONES DIGITALES", {
    x: MARGIN + 62,
    y: PAGE_HEIGHT - 80,
    font: regular,
    size: 6.5,
    color: MUTED,
  });

  const badgeWidth = 142;
  const badgeHeight = 51;
  const badgeX = PAGE_WIDTH - MARGIN - badgeWidth;
  const badgeY = PAGE_HEIGHT - 91;

  drawRoundedRectangle(page, {
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    radius: 14,
    color: BLACK,
  });

  page.drawText("COTIZACIÓN", {
    x: badgeX + 15,
    y: badgeY + 31,
    font: bold,
    size: 7.2,
    color: WHITE,
  });
  page.drawText(safeText(quotation.number), {
    x: badgeX + 15,
    y: badgeY + 14,
    font: regular,
    size: 8.4,
    color: rgb(0.78, 0.78, 0.8),
  });
}

function drawSectionLabel(page: PDFPage, bold: PDFFont, label: string, y: number) {
  page.drawText(safeText(label.toUpperCase()), {
    x: MARGIN + 2,
    y,
    font: bold,
    size: 6.8,
    color: MUTED,
  });
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  const height = 32;

  drawRoundedRectangle(page, {
    x: MARGIN,
    y: y - height,
    width: CONTENT_WIDTH,
    height,
    radius: 10,
    color: BLACK,
  });

  const labels = [
    ["N°", MARGIN + 12],
    ["SERVICIO Y DETALLE", MARGIN + 45],
    ["CANT.", MARGIN + 313],
    ["VALOR UNIT.", MARGIN + 361],
    ["SUBTOTAL", MARGIN + 445],
  ] as const;

  labels.forEach(([label, x]) => {
    page.drawText(label, {
      x,
      y: y - 20,
      font: bold,
      size: 6.3,
      color: WHITE,
    });
  });

  return y - height - 6;
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
    start: { x: MARGIN, y: 49 },
    end: { x: PAGE_WIDTH - MARGIN, y: 49 },
    thickness: 0.6,
    color: LINE,
  });

  page.drawText("Vialoop Studio SpA", {
    x: MARGIN,
    y: 27,
    font: bold,
    size: 7,
    color: SECONDARY,
  });

  page.drawText(`vialoop.cl  /  ${safeText(quotation.senderEmail)}`, {
    x: MARGIN + 83,
    y: 27,
    font: regular,
    size: 7,
    color: MUTED,
  });

  const pageLabel = `${pageNumber} / ${pageCount}`;
  const pillWidth = 38;

  drawRoundedRectangle(page, {
    x: PAGE_WIDTH - MARGIN - pillWidth,
    y: 19,
    width: pillWidth,
    height: 19,
    radius: 9.5,
    color: SOFT_DEEP,
  });
  drawCenteredText(
    page,
    pageLabel,
    PAGE_WIDTH - MARGIN - pillWidth / 2,
    25.5,
    bold,
    6.5,
    SECONDARY,
  );
}

export async function createQuotationPdf(quotation: QuotationMetadata) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedPng(vialoopLogoPng);

  document.setTitle(`Cotización ${quotation.number}`);
  document.setAuthor("Vialoop Studio SpA");
  document.setSubject(quotation.projectName || "Propuesta comercial");
  document.setCreator("Portal Vialoop");
  document.setProducer("Vialoop Studio SpA");

  const pages: PDFPage[] = [];
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawHeader(page, bold, regular, logo, quotation);

  let y = PAGE_HEIGHT - 126;

  const addPage = (section: string, includeTableHeader = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawHeader(page, bold, regular, logo, quotation);
    y = PAGE_HEIGHT - 126;
    drawSectionLabel(page, bold, section, y);
    y -= 22;

    if (includeTableHeader) {
      y = drawTableHeader(page, bold, y);
    }
  };

  const clientPanelHeight = 112;
  drawRoundedRectangle(page, {
    x: MARGIN,
    y: y - clientPanelHeight,
    width: CONTENT_WIDTH,
    height: clientPanelHeight,
    radius: 17,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.7,
  });

  page.drawText("PREPARADA PARA", {
    x: MARGIN + 18,
    y: y - 23,
    font: bold,
    size: 6.7,
    color: MUTED,
  });

  const clientLines = wrapText(quotation.clientName, bold, 18.5, 300).slice(0, 2);
  clientLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN + 18,
      y: y - 49 - index * 21,
      font: bold,
      size: 18.5,
      color: INK,
    });
  });

  const contactLines = wrapText(
    quotation.contactName || quotation.recipientEmail,
    regular,
    8.3,
    300,
  ).slice(0, 2);
  const contactY = y - 49 - clientLines.length * 21 - 2;
  contactLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN + 18,
      y: contactY - index * 10.5,
      font: regular,
      size: 8.3,
      color: SECONDARY,
    });
  });

  const metaX = MARGIN + 352;
  page.drawLine({
    start: { x: metaX - 15, y: y - 94 },
    end: { x: metaX - 15, y: y - 18 },
    thickness: 0.7,
    color: LINE,
  });
  page.drawText("FECHA DE EMISIÓN", {
    x: metaX,
    y: y - 28,
    font: bold,
    size: 6.2,
    color: MUTED,
  });
  page.drawText(formatDate(quotation.issuedAt), {
    x: metaX,
    y: y - 44,
    font: bold,
    size: 8.2,
    color: INK,
  });
  page.drawText("VIGENCIA", {
    x: metaX,
    y: y - 69,
    font: bold,
    size: 6.2,
    color: MUTED,
  });
  page.drawText(`Hasta ${safeText(formatDate(quotation.validUntil))}`, {
    x: metaX,
    y: y - 85,
    font: bold,
    size: 8.2,
    color: INK,
  });

  y -= clientPanelHeight + 14;

  if (quotation.projectName) {
    const projectLines = wrapText(
      quotation.projectName,
      bold,
      10.5,
      CONTENT_WIDTH - 34,
    ).slice(0, 2);
    const projectPanelHeight = 48 + Math.max(0, projectLines.length - 1) * 13;

    drawRoundedRectangle(page, {
      x: MARGIN,
      y: y - projectPanelHeight,
      width: CONTENT_WIDTH,
      height: projectPanelHeight,
      radius: 13,
      color: WHITE,
      borderColor: LINE,
      borderWidth: 0.8,
    });
    page.drawText("PROYECTO / PROPUESTA", {
      x: MARGIN + 16,
      y: y - 17,
      font: bold,
      size: 6.2,
      color: MUTED,
    });
    projectLines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + 16,
        y: y - 35 - index * 13,
        font: bold,
        size: 10.5,
        color: INK,
      });
    });
    y -= projectPanelHeight + 18;
  }

  drawSectionLabel(page, bold, "Alcance y valores", y);
  y -= 19;
  y = drawTableHeader(page, bold, y);

  quotation.items.forEach((item, itemIndex) => {
    const titleLines = wrapText(item.description, bold, 8.7, 250);
    const detailLines = item.detail
      ? wrapText(item.detail, regular, 7.7, 250)
      : [];
    const textHeight = titleLines.length * 10.7 + detailLines.length * 9.4;
    const detailGap = detailLines.length > 0 ? 3 : 0;
    const rowHeight = Math.max(47, textHeight + detailGap + 19);

    if (y - rowHeight < FOOTER_LIMIT + 14) {
      addPage("Detalle de servicios - continuación", true);
    }

    drawRoundedRectangle(page, {
      x: MARGIN,
      y: y - rowHeight,
      width: CONTENT_WIDTH,
      height: rowHeight,
      radius: 10,
      color: itemIndex % 2 === 0 ? WHITE : SOFT,
      borderColor: LINE,
      borderWidth: 0.65,
    });

    drawRoundedRectangle(page, {
      x: MARGIN + 10,
      y: y - 33,
      width: 23,
      height: 23,
      radius: 11.5,
      color: itemIndex % 2 === 0 ? SOFT : SOFT_DEEP,
    });
    drawCenteredText(
      page,
      String(itemIndex + 1).padStart(2, "0"),
      MARGIN + 21.5,
      y - 25.5,
      bold,
      6.8,
      SECONDARY,
    );

    let textY = y - 19;
    titleLines.forEach((line) => {
      page.drawText(line, {
        x: MARGIN + 45,
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
          x: MARGIN + 45,
          y: textY,
          font: regular,
          size: 7.7,
          color: SECONDARY,
        });
        textY -= 9.4;
      });
    }

    drawCenteredText(
      page,
      String(item.quantity),
      MARGIN + 329,
      y - 24,
      regular,
      8,
      SECONDARY,
    );
    drawRightText(
      page,
      formatCurrency(item.unitPrice),
      MARGIN + 434,
      y - 24,
      regular,
      8,
      SECONDARY,
    );
    drawRightText(
      page,
      formatCurrency(item.quantity * item.unitPrice),
      PAGE_WIDTH - MARGIN - 12,
      y - 24,
      bold,
      8.2,
      INK,
    );

    y -= rowHeight + 6;
  });

  const notesLines = wrapText(quotation.notes, regular, 8.2, CONTENT_WIDTH - 34);
  const summaryHeight = 122;
  const firstNotesHeight = Math.min(notesLines.length, 11) * 10.7 + 48;

  if (y - summaryHeight - firstNotesHeight < FOOTER_LIMIT) {
    addPage("Resumen comercial");
  } else {
    y -= 18;
    drawSectionLabel(page, bold, "Resumen comercial", y);
    y -= 20;
  }

  const summaryWidth = 246;
  const summaryX = PAGE_WIDTH - MARGIN - summaryWidth;
  const summaryPanelHeight = 112;

  drawRoundedRectangle(page, {
    x: summaryX,
    y: y - summaryPanelHeight,
    width: summaryWidth,
    height: summaryPanelHeight,
    radius: 16,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.7,
  });

  const summaryRows = [
    ["Neto", quotation.netAmount],
    ["IVA 19%", quotation.taxAmount],
  ] as const;

  summaryRows.forEach(([label, value], index) => {
    const rowY = y - 23 - index * 22;
    page.drawText(label, {
      x: summaryX + 15,
      y: rowY,
      font: regular,
      size: 8.1,
      color: SECONDARY,
    });
    drawRightText(
      page,
      formatCurrency(value),
      summaryX + summaryWidth - 15,
      rowY,
      bold,
      8.4,
      INK,
    );
  });

  drawRoundedRectangle(page, {
    x: summaryX + 8,
    y: y - summaryPanelHeight + 8,
    width: summaryWidth - 16,
    height: 43,
    radius: 12,
    color: BLACK,
  });
  page.drawText("TOTAL", {
    x: summaryX + 22,
    y: y - summaryPanelHeight + 24,
    font: bold,
    size: 7.6,
    color: WHITE,
  });
  drawRightText(
    page,
    formatCurrency(quotation.totalAmount),
    summaryX + summaryWidth - 22,
    y - summaryPanelHeight + 21,
    bold,
    13.5,
    WHITE,
  );

  page.drawText("INVERSIÓN", {
    x: MARGIN + 2,
    y: y - 19,
    font: bold,
    size: 6.6,
    color: MUTED,
  });
  page.drawText("Valores expresados en pesos chilenos", {
    x: MARGIN + 2,
    y: y - 39,
    font: regular,
    size: 8.2,
    color: SECONDARY,
  });
  page.drawText("El total incluye IVA.", {
    x: MARGIN + 2,
    y: y - 54,
    font: bold,
    size: 8.2,
    color: INK,
  });

  y -= summaryPanelHeight + 22;

  let remainingNotes = notesLines;
  let firstNotesBlock = true;

  while (remainingNotes.length > 0) {
    const availableLines = Math.max(
      1,
      Math.floor((y - FOOTER_LIMIT - 48) / 10.7),
    );

    if (availableLines < 3) {
      addPage("Condiciones comerciales");
      continue;
    }

    const currentLines = remainingNotes.slice(0, availableLines);
    remainingNotes = remainingNotes.slice(currentLines.length);
    const panelHeight = currentLines.length * 10.7 + 43;

    drawRoundedRectangle(page, {
      x: MARGIN,
      y: y - panelHeight,
      width: CONTENT_WIDTH,
      height: panelHeight,
      radius: 15,
      color: SOFT,
      borderColor: LINE,
      borderWidth: 0.65,
    });
    page.drawText(firstNotesBlock ? "CONDICIONES COMERCIALES" : "CONTINUACIÓN", {
      x: MARGIN + 17,
      y: y - 20,
      font: bold,
      size: 6.6,
      color: MUTED,
    });

    currentLines.forEach((line, index) => {
      page.drawText(line || " ", {
        x: MARGIN + 17,
        y: y - 39 - index * 10.7,
        font: regular,
        size: 8.2,
        color: SECONDARY,
      });
    });

    y -= panelHeight + 18;
    firstNotesBlock = false;

    if (remainingNotes.length > 0) {
      addPage("Condiciones comerciales");
    }
  }

  if (y < 154) {
    addPage("Contacto comercial");
  }

  drawRoundedRectangle(page, {
    x: MARGIN,
    y: y - 25,
    width: 112,
    height: 24,
    radius: 12,
    color: BLACK,
  });
  page.drawText("RESPONSABLE COMERCIAL", {
    x: MARGIN + 13,
    y: y - 16.5,
    font: bold,
    size: 5.8,
    color: WHITE,
  });
  page.drawText(safeText(quotation.senderName), {
    x: MARGIN,
    y: y - 49,
    font: bold,
    size: 10.2,
    color: INK,
  });
  page.drawText(safeText(quotation.senderRole), {
    x: MARGIN,
    y: y - 65,
    font: regular,
    size: 7.4,
    color: SECONDARY,
  });
  page.drawText(safeText(quotation.senderEmail), {
    x: MARGIN,
    y: y - 79,
    font: regular,
    size: 7.4,
    color: MUTED,
  });

  const referenceWidth = 158;
  drawRoundedRectangle(page, {
    x: PAGE_WIDTH - MARGIN - referenceWidth,
    y: y - 78,
    width: referenceWidth,
    height: 62,
    radius: 15,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.75,
  });
  page.drawText("PROPUESTA COMERCIAL", {
    x: PAGE_WIDTH - MARGIN - referenceWidth + 15,
    y: y - 36,
    font: bold,
    size: 6.1,
    color: MUTED,
  });
  drawRightText(
    page,
    quotation.number,
    PAGE_WIDTH - MARGIN - 15,
    y - 58,
    bold,
    9.4,
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
