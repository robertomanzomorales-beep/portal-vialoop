import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { vialoopLogoPng } from "@/lib/vialoop-logo";
import { VIALOOP_PAYMENT_DETAILS } from "@/lib/vialoop-payment-details";

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
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_LIMIT = 68;

const BLACK = rgb(0.045, 0.045, 0.05);
const INK = rgb(0.105, 0.105, 0.115);
const SECONDARY = rgb(0.33, 0.33, 0.35);
const MUTED = rgb(0.52, 0.52, 0.55);
const LINE = rgb(0.79, 0.79, 0.81);
const LIGHT_LINE = rgb(0.89, 0.89, 0.9);
const PAPER = rgb(0.965, 0.96, 0.948);

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

function drawRule(
  page: PDFPage,
  y: number,
  {
    start = MARGIN,
    end = PAGE_WIDTH - MARGIN,
    thickness = 0.55,
    color = LINE,
  }: {
    start?: number;
    end?: number;
    thickness?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  page.drawLine({
    start: { x: start, y },
    end: { x: end, y },
    thickness,
    color,
  });
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

function drawLabel(
  page: PDFPage,
  label: string,
  x: number,
  y: number,
  bold: PDFFont,
  color = MUTED,
) {
  page.drawText(safeText(label.toUpperCase()), {
    x,
    y,
    font: bold,
    size: 6.3,
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
    y: PAGE_HEIGHT - 3.5,
    width: PAGE_WIDTH,
    height: 3.5,
    color: BLACK,
  });

  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - 72,
    width: 38,
    height: 38,
  });

  page.drawText("Vialoop Studio SpA", {
    x: MARGIN + 50,
    y: PAGE_HEIGHT - 48,
    font: bold,
    size: 11.5,
    color: INK,
  });
  page.drawText("Diseño, tecnología y operación digital", {
    x: MARGIN + 50,
    y: PAGE_HEIGHT - 63,
    font: regular,
    size: 6.8,
    color: MUTED,
  });

  drawRightText(
    page,
    "COTIZACIÓN",
    PAGE_WIDTH - MARGIN,
    PAGE_HEIGHT - 47,
    bold,
    6.6,
    MUTED,
  );
  drawRightText(
    page,
    quotation.number,
    PAGE_WIDTH - MARGIN,
    PAGE_HEIGHT - 64,
    bold,
    10.3,
    INK,
  );

  drawRule(page, PAGE_HEIGHT - 86, {
    thickness: 0.8,
    color: BLACK,
  });
}

function drawFooter(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  quotation: QuotationMetadata,
  pageNumber: number,
  pageCount: number,
) {
  drawRule(page, 48, { color: LIGHT_LINE });

  page.drawText("Vialoop Studio SpA", {
    x: MARGIN,
    y: 27,
    font: bold,
    size: 6.7,
    color: SECONDARY,
  });
  page.drawText(`vialoop.cl / ${safeText(quotation.senderEmail)}`, {
    x: MARGIN + 84,
    y: 27,
    font: regular,
    size: 6.7,
    color: MUTED,
  });
  drawRightText(
    page,
    `${String(pageNumber).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`,
    PAGE_WIDTH - MARGIN,
    27,
    bold,
    6.7,
    SECONDARY,
  );
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 28,
    width: CONTENT_WIDTH,
    height: 28,
    color: PAPER,
  });
  drawRule(page, y, { thickness: 1.1, color: BLACK });
  drawRule(page, y - 28, { color: BLACK });

  drawLabel(page, "N°", MARGIN + 2, y - 18, bold, SECONDARY);
  drawLabel(page, "Servicio / alcance", MARGIN + 36, y - 18, bold, SECONDARY);
  drawLabel(page, "Cant.", MARGIN + 319, y - 18, bold, SECONDARY);
  drawLabel(page, "Unitario", MARGIN + 371, y - 18, bold, SECONDARY);
  drawLabel(page, "Subtotal", MARGIN + 449, y - 18, bold, SECONDARY);

  return y - 38;
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

  let y = PAGE_HEIGHT - 116;

  const addPage = (section: string, includeTableHeader = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawHeader(page, bold, regular, logo, quotation);
    y = PAGE_HEIGHT - 112;
    drawLabel(page, section, MARGIN, y, bold);
    y -= 23;

    if (includeTableHeader) {
      y = drawTableHeader(page, bold, y);
    }
  };

  drawLabel(page, "Propuesta comercial", MARGIN, y, bold);
  y -= 29;

  const projectTitle = quotation.projectName || "Propuesta comercial";
  const titleLines = wrapText(projectTitle, bold, 24, CONTENT_WIDTH - 20).slice(0, 3);
  titleLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN,
      y: y - index * 27,
      font: bold,
      size: 24,
      color: INK,
    });
  });
  y -= titleLines.length * 27 + 20;

  const clientWidth = 278;
  const issuedWidth = 112;
  const metaStart = MARGIN + clientWidth;
  const validityStart = metaStart + issuedWidth;
  const gridHeight = 77;

  drawRule(page, y, { thickness: 1, color: BLACK });
  drawRule(page, y - gridHeight, { color: BLACK });
  page.drawLine({
    start: { x: metaStart, y },
    end: { x: metaStart, y: y - gridHeight },
    thickness: 0.5,
    color: LINE,
  });
  page.drawLine({
    start: { x: validityStart, y },
    end: { x: validityStart, y: y - gridHeight },
    thickness: 0.5,
    color: LINE,
  });

  drawLabel(page, "Preparada para", MARGIN, y - 18, bold);
  const clientLines = wrapText(
    quotation.clientName,
    bold,
    12.7,
    clientWidth - 24,
  ).slice(0, 2);
  clientLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN,
      y: y - 39 - index * 14,
      font: bold,
      size: 12.7,
      color: INK,
    });
  });
  const contact = quotation.contactName || quotation.recipientEmail;
  page.drawText(safeText(contact), {
    x: MARGIN,
    y: y - 65,
    font: regular,
    size: 7.7,
    color: SECONDARY,
  });

  drawLabel(page, "Emisión", metaStart + 14, y - 18, bold);
  const issuedLines = wrapText(
    formatDate(quotation.issuedAt),
    bold,
    7.8,
    issuedWidth - 28,
  ).slice(0, 2);
  issuedLines.forEach((line, index) => {
    page.drawText(line, {
      x: metaStart + 14,
      y: y - 39 - index * 11,
      font: bold,
      size: 7.8,
      color: INK,
    });
  });

  drawLabel(page, "Vigencia", validityStart + 14, y - 18, bold);
  const validityLines = wrapText(
    `Hasta ${formatDate(quotation.validUntil)}`,
    bold,
    7.8,
    PAGE_WIDTH - MARGIN - validityStart - 14,
  ).slice(0, 2);
  validityLines.forEach((line, index) => {
    page.drawText(line, {
      x: validityStart + 14,
      y: y - 39 - index * 11,
      font: bold,
      size: 7.8,
      color: INK,
    });
  });

  y -= gridHeight + 31;
  drawLabel(page, "Servicios y valores", MARGIN, y, bold);
  y -= 18;
  y = drawTableHeader(page, bold, y);

  quotation.items.forEach((item, itemIndex) => {
    const itemTitleLines = wrapText(item.description, bold, 9.1, 272);
    const detailLines = item.detail
      ? wrapText(item.detail, regular, 7.7, 272)
      : [];
    const detailGap = detailLines.length > 0 ? 5 : 0;
    const textHeight =
      itemTitleLines.length * 11.2 + detailGap + detailLines.length * 9.4;
    const rowHeight = Math.max(52, textHeight + 20);

    if (y - rowHeight < FOOTER_LIMIT + 12) {
      addPage("Servicios / continuación", true);
    }

    page.drawText(String(itemIndex + 1).padStart(2, "0"), {
      x: MARGIN + 2,
      y: y - 20,
      font: bold,
      size: 7.1,
      color: MUTED,
    });

    let textY = y - 20;
    itemTitleLines.forEach((line) => {
      page.drawText(line, {
        x: MARGIN + 36,
        y: textY,
        font: bold,
        size: 9.1,
        color: INK,
      });
      textY -= 11.2;
    });

    if (detailLines.length > 0) {
      textY -= 2;
      detailLines.forEach((line) => {
        page.drawText(line, {
          x: MARGIN + 36,
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
      MARGIN + 334,
      y - 20,
      regular,
      8,
      SECONDARY,
    );
    drawRightText(
      page,
      formatCurrency(item.unitPrice),
      MARGIN + 421,
      y - 20,
      regular,
      8,
      SECONDARY,
    );
    drawRightText(
      page,
      formatCurrency(item.quantity * item.unitPrice),
      PAGE_WIDTH - MARGIN,
      y - 20,
      bold,
      8.2,
      INK,
    );

    y -= rowHeight;
    drawRule(page, y, { color: LIGHT_LINE });
  });

  const notesLines = quotation.notes.trim()
    ? wrapText(quotation.notes, regular, 8.2, CONTENT_WIDTH)
    : [];
  const estimatedNotesHeight = notesLines.length * 10.7 + 44;
  const estimatedClosingHeight = 112;

  if (y - 128 - estimatedNotesHeight - estimatedClosingHeight < FOOTER_LIMIT) {
    addPage("Resumen comercial");
  } else {
    y -= 28;
    drawLabel(page, "Resumen comercial", MARGIN, y, bold);
    y -= 19;
  }

  drawRule(page, y, { thickness: 1.15, color: BLACK });
  drawLabel(page, "Inversión", MARGIN, y - 21, bold, SECONDARY);
  page.drawText("Valores expresados en pesos chilenos.", {
    x: MARGIN,
    y: y - 43,
    font: regular,
    size: 8.2,
    color: SECONDARY,
  });
  page.drawText("El total incluye IVA.", {
    x: MARGIN,
    y: y - 59,
    font: bold,
    size: 8.2,
    color: INK,
  });

  const summaryX = MARGIN + 305;
  page.drawText("Neto", {
    x: summaryX,
    y: y - 21,
    font: regular,
    size: 8.1,
    color: SECONDARY,
  });
  drawRightText(
    page,
    formatCurrency(quotation.netAmount),
    PAGE_WIDTH - MARGIN,
    y - 21,
    bold,
    8.4,
    INK,
  );
  page.drawText("IVA 19%", {
    x: summaryX,
    y: y - 43,
    font: regular,
    size: 8.1,
    color: SECONDARY,
  });
  drawRightText(
    page,
    formatCurrency(quotation.taxAmount),
    PAGE_WIDTH - MARGIN,
    y - 43,
    bold,
    8.4,
    INK,
  );
  drawRule(page, y - 57, {
    start: summaryX,
    thickness: 0.8,
    color: BLACK,
  });
  page.drawText("TOTAL", {
    x: summaryX,
    y: y - 82,
    font: bold,
    size: 7.1,
    color: INK,
  });
  drawRightText(
    page,
    formatCurrency(quotation.totalAmount),
    PAGE_WIDTH - MARGIN,
    y - 88,
    bold,
    18,
    BLACK,
  );
  y -= 108;
  drawRule(page, y, { thickness: 1.15, color: BLACK });
  y -= 28;

  let remainingNotes = [...notesLines];
  let firstNotesBlock = true;

  while (remainingNotes.length > 0) {
    const availableLines = Math.max(
      1,
      Math.floor((y - FOOTER_LIMIT - 126) / 10.7),
    );

    if (availableLines < 3) {
      addPage("Condiciones comerciales");
      continue;
    }

    const currentLines = remainingNotes.slice(0, availableLines);
    remainingNotes = remainingNotes.slice(currentLines.length);

    drawLabel(
      page,
      firstNotesBlock ? "Condiciones comerciales" : "Condiciones / continuación",
      MARGIN,
      y,
      bold,
    );
    y -= 24;

    currentLines.forEach((line) => {
      if (line) {
        page.drawText(line, {
          x: MARGIN,
          y,
          font: regular,
          size: 8.2,
          color: SECONDARY,
        });
      }
      y -= 10.7;
    });

    y -= 14;
    drawRule(page, y, { color: LIGHT_LINE });
    y -= 27;
    firstNotesBlock = false;

    if (remainingNotes.length > 0) {
      addPage("Condiciones comerciales");
    }
  }

  if (y < 258) {
    addPage("Datos para pago");
  }

  drawLabel(page, "Datos para pago", MARGIN, y, bold);
  y -= 18;
  drawRule(page, y, { thickness: 0.85, color: BLACK });

  const paymentColumnWidth = CONTENT_WIDTH / 3;
  const paymentStartY = y;
  const paymentBottomY = y - 62;

  page.drawLine({
    start: { x: MARGIN + paymentColumnWidth, y: paymentStartY },
    end: { x: MARGIN + paymentColumnWidth, y: paymentBottomY },
    thickness: 0.45,
    color: LINE,
  });
  page.drawLine({
    start: { x: MARGIN + paymentColumnWidth * 2, y: paymentStartY },
    end: { x: MARGIN + paymentColumnWidth * 2, y: paymentBottomY },
    thickness: 0.45,
    color: LINE,
  });

  drawLabel(page, "Titular", MARGIN, y - 17, bold);
  page.drawText(VIALOOP_PAYMENT_DETAILS.holder, {
    x: MARGIN,
    y: y - 36,
    font: bold,
    size: 8.7,
    color: INK,
  });
  page.drawText(`RUT ${VIALOOP_PAYMENT_DETAILS.taxId}`, {
    x: MARGIN,
    y: y - 51,
    font: regular,
    size: 7.4,
    color: SECONDARY,
  });

  const institutionX = MARGIN + paymentColumnWidth + 14;
  drawLabel(page, "Institución / tipo", institutionX, y - 17, bold);
  page.drawText(VIALOOP_PAYMENT_DETAILS.institution, {
    x: institutionX,
    y: y - 36,
    font: bold,
    size: 8.7,
    color: INK,
  });
  page.drawText(VIALOOP_PAYMENT_DETAILS.accountType, {
    x: institutionX,
    y: y - 51,
    font: regular,
    size: 7.4,
    color: SECONDARY,
  });

  const accountX = MARGIN + paymentColumnWidth * 2 + 14;
  drawLabel(page, "Cuenta / comprobante", accountX, y - 17, bold);
  page.drawText(VIALOOP_PAYMENT_DETAILS.accountNumber, {
    x: accountX,
    y: y - 36,
    font: bold,
    size: 8.7,
    color: INK,
  });
  page.drawText(VIALOOP_PAYMENT_DETAILS.email, {
    x: accountX,
    y: y - 51,
    font: regular,
    size: 7.4,
    color: SECONDARY,
  });

  y = paymentBottomY;
  drawRule(page, y, { color: BLACK });
  y -= 29;

  if (y < 166) {
    addPage("Contacto comercial");
  }

  drawRule(page, y, { thickness: 0.85, color: BLACK });
  drawLabel(page, "Responsable comercial", MARGIN, y - 21, bold);
  page.drawText(safeText(quotation.senderName), {
    x: MARGIN,
    y: y - 47,
    font: bold,
    size: 11.2,
    color: INK,
  });
  page.drawText(safeText(quotation.senderRole), {
    x: MARGIN,
    y: y - 64,
    font: regular,
    size: 7.7,
    color: SECONDARY,
  });
  page.drawText(safeText(quotation.senderEmail), {
    x: MARGIN,
    y: y - 79,
    font: regular,
    size: 7.7,
    color: MUTED,
  });

  const referenceX = MARGIN + 305;
  drawLabel(page, "Referencia", referenceX, y - 21, bold);
  drawRightText(
    page,
    quotation.number,
    PAGE_WIDTH - MARGIN,
    y - 48,
    bold,
    11.2,
    INK,
  );
  drawRightText(
    page,
    "Propuesta comercial",
    PAGE_WIDTH - MARGIN,
    y - 65,
    regular,
    7.7,
    SECONDARY,
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
