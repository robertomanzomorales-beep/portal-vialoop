import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  degrees,
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

type PdfFonts = {
  regular: PDFFont;
  medium: PDFFont;
  semibold: PDFFont;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 56;
const RIGHT = PAGE_WIDTH - 44;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_LIMIT = 62;

const INK = rgb(0.071, 0.067, 0.059);
const PAPER = rgb(0.961, 0.945, 0.91);
const PAPER_DARK = rgb(0.91, 0.892, 0.853);
const SECONDARY = rgb(0.31, 0.298, 0.275);
const MUTED = rgb(0.49, 0.47, 0.435);
const LINE = rgb(0.755, 0.73, 0.68);
const LIGHT_LINE = rgb(0.865, 0.84, 0.79);
const ACCENT = rgb(0.875, 0.275, 0.14);
const WHITE = rgb(1, 1, 1);

const FONT_ROOT = join(
  process.cwd(),
  "node_modules/geist/dist/fonts/geist-sans",
);

let fontFilesPromise:
  | Promise<readonly [Buffer, Buffer, Buffer]>
  | undefined;

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
      typeof value.senderRole === "string"
        ? value.senderRole
        : "Gestión comercial",
    emailStatus:
      value.emailStatus === "SENT" || value.emailStatus === "FAILED"
        ? value.emailStatus
        : "PENDING",
    messageId: typeof value.messageId === "string" ? value.messageId : undefined,
    lastError: typeof value.lastError === "string" ? value.lastError : undefined,
  };
}

function cleanText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\t/g, " ");
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
    return "—";
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

async function loadFontFiles() {
  fontFilesPromise ??= Promise.all([
    readFile(join(FONT_ROOT, "Geist-Regular.ttf")),
    readFile(join(FONT_ROOT, "Geist-Medium.ttf")),
    readFile(join(FONT_ROOT, "Geist-SemiBold.ttf")),
  ]);

  return fontFilesPromise;
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
  const paragraphs = cleanText(text).replace(/\r/g, "").split("\n");
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

function fittedTitle(text: string, font: PDFFont) {
  for (const size of [34, 32, 30, 28, 26]) {
    const lines = wrapText(text, font, size, CONTENT_WIDTH - 14);

    if (lines.length <= 3) {
      return { lines, size };
    }
  }

  return {
    lines: wrapText(text, font, 24, CONTENT_WIDTH - 14),
    size: 24,
  };
}

function splitBalancedColumns(lines: string[], maximumRows: number) {
  const middle = Math.ceil(lines.length / 2);
  const paragraphBreaks = lines
    .map((line, index) => (line === "" ? index + 1 : -1))
    .filter(
      (index) =>
        index > 0 &&
        index <= maximumRows &&
        lines.length - index <= maximumRows,
    );
  const splitAt =
    paragraphBreaks.sort(
      (first, second) =>
        Math.abs(first - middle) - Math.abs(second - middle),
    )[0] ?? Math.min(maximumRows, middle);
  const left = lines.slice(0, splitAt);
  const right = lines.slice(splitAt);

  while (left.at(-1) === "") {
    left.pop();
  }

  while (right[0] === "") {
    right.shift();
  }

  return { left, right };
}

function drawRule(
  page: PDFPage,
  y: number,
  options: {
    start?: number;
    end?: number;
    thickness?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  page.drawLine({
    start: { x: options.start ?? LEFT, y },
    end: { x: options.end ?? RIGHT, y },
    thickness: options.thickness ?? 0.55,
    color: options.color ?? LINE,
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
  const normalized = cleanText(text);

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
  const normalized = cleanText(text);

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
  font: PDFFont,
  color = MUTED,
  size = 6.6,
) {
  page.drawText(cleanText(label.toUpperCase()), {
    x,
    y,
    font,
    size,
    color,
  });
}

function drawSectionTitle(
  page: PDFPage,
  index: string,
  title: string,
  y: number,
  fonts: PdfFonts,
) {
  drawLabel(page, index, LEFT, y, fonts.semibold, ACCENT, 7.2);
  drawLabel(page, title, LEFT + 38, y, fonts.semibold, INK, 7.2);
  drawRule(page, y - 10, { thickness: 0.8, color: INK });
}

function drawPageBase(
  page: PDFPage,
  fonts: PdfFonts,
  logo: PDFImage,
  quotation: QuotationMetadata,
  continuation?: string,
) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: PAPER,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 6,
    width: PAGE_WIDTH,
    height: 6,
    color: ACCENT,
  });
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 10,
    height: PAGE_HEIGHT,
    color: INK,
  });
  page.drawText("VIALOOP / PROPUESTA COMERCIAL", {
    x: 19,
    y: 77,
    rotate: degrees(90),
    font: fonts.medium,
    size: 5.4,
    color: PAPER_DARK,
  });

  page.drawImage(logo, {
    x: LEFT,
    y: PAGE_HEIGHT - 71,
    width: 29,
    height: 29,
  });
  page.drawText("VIALOOP", {
    x: LEFT + 40,
    y: PAGE_HEIGHT - 51,
    font: fonts.semibold,
    size: 12.2,
    color: INK,
  });
  drawLabel(
    page,
    "Studio SpA · Diseño y tecnología",
    LEFT + 40,
    PAGE_HEIGHT - 67,
    fonts.medium,
    MUTED,
    5.9,
  );

  drawLabel(page, "Cotización", RIGHT - 126, PAGE_HEIGHT - 49, fonts.semibold);
  drawRightText(
    page,
    quotation.number,
    RIGHT,
    PAGE_HEIGHT - 67,
    fonts.semibold,
    10,
    INK,
  );
  drawRule(page, PAGE_HEIGHT - 87, { thickness: 0.9, color: INK });

  if (continuation) {
    drawLabel(page, continuation, LEFT, PAGE_HEIGHT - 116, fonts.semibold, ACCENT);
    const title = quotation.projectName || "Propuesta comercial";
    const titleLines = wrapText(title, fonts.medium, 10.4, CONTENT_WIDTH - 160).slice(
      0,
      2,
    );

    titleLines.forEach((line, index) => {
      page.drawText(line, {
        x: LEFT,
        y: PAGE_HEIGHT - 139 - index * 12.6,
        font: fonts.medium,
        size: 10.4,
        color: INK,
      });
    });
  }
}

function drawFooter(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  pageNumber: number,
  pageCount: number,
) {
  drawRule(page, 43, { color: LIGHT_LINE });
  drawLabel(page, "Vialoop Studio SpA", LEFT, 24, fonts.semibold, SECONDARY, 6.2);
  page.drawText("vialoop.cl", {
    x: LEFT + 99,
    y: 24,
    font: fonts.regular,
    size: 6.2,
    color: MUTED,
  });
  drawRightText(
    page,
    `${quotation.number}  ·  ${String(pageNumber).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`,
    RIGHT,
    24,
    fonts.medium,
    6.2,
    MUTED,
  );
}

function drawItemsHeader(page: PDFPage, fonts: PdfFonts, y: number) {
  drawLabel(page, "Ítem", LEFT, y, fonts.semibold, MUTED, 6.1);
  drawLabel(page, "Servicio y alcance", LEFT + 38, y, fonts.semibold, MUTED, 6.1);
  drawLabel(page, "Cant.", LEFT + 309, y, fonts.semibold, MUTED, 6.1);
  drawRightText(page, "Unitario", LEFT + 410, y, fonts.semibold, 6.1, MUTED);
  drawRightText(page, "Importe", RIGHT, y, fonts.semibold, 6.1, MUTED);
  drawRule(page, y - 12, { thickness: 0.8, color: INK });

  return y - 13;
}

function itemMetrics(item: QuotationItem, fonts: PdfFonts) {
  const titleLines = wrapText(item.description, fonts.semibold, 10.4, 257);
  const detailLines = item.detail
    ? wrapText(item.detail, fonts.regular, 8.1, 257)
    : [];
  const rowHeight = Math.max(
    56,
    18 +
      titleLines.length * 12.2 +
      (detailLines.length ? 4 : 0) +
      detailLines.length * 9.8 +
      10,
  );

  return { titleLines, detailLines, rowHeight };
}

function drawItem(
  page: PDFPage,
  fonts: PdfFonts,
  item: QuotationItem,
  index: number,
  y: number,
  metrics: ReturnType<typeof itemMetrics>,
) {
  drawRule(page, y, { color: LIGHT_LINE });

  page.drawText(String(index + 1).padStart(2, "0"), {
    x: LEFT,
    y: y - 23,
    font: fonts.medium,
    size: 7,
    color: ACCENT,
  });

  let textY = y - 23;
  metrics.titleLines.forEach((line) => {
    page.drawText(line, {
      x: LEFT + 38,
      y: textY,
      font: fonts.semibold,
      size: 10.4,
      color: INK,
    });
    textY -= 12.2;
  });

  if (metrics.detailLines.length > 0) {
    textY -= 2;
    metrics.detailLines.forEach((line) => {
      page.drawText(line, {
        x: LEFT + 38,
        y: textY,
        font: fonts.regular,
        size: 8.1,
        color: SECONDARY,
      });
      textY -= 9.8;
    });
  }

  drawCenteredText(
    page,
    String(item.quantity),
    LEFT + 322,
    y - 23,
    fonts.medium,
    8.1,
    SECONDARY,
  );
  drawRightText(
    page,
    formatCurrency(item.unitPrice),
    LEFT + 410,
    y - 23,
    fonts.regular,
    8.1,
    SECONDARY,
  );
  drawRightText(
    page,
    formatCurrency(item.quantity * item.unitPrice),
    RIGHT,
    y - 23,
    fonts.semibold,
    8.5,
    INK,
  );

  return y - metrics.rowHeight;
}

function drawInvestment(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  y: number,
) {
  drawSectionTitle(page, "02", "Inversión", y, fonts);
  const top = y - 29;
  const blockHeight = 104;
  const totalX = LEFT + 246;

  drawLabel(page, "Desglose", LEFT, top - 4, fonts.semibold, MUTED);
  page.drawText("Neto", {
    x: LEFT,
    y: top - 31,
    font: fonts.regular,
    size: 8.5,
    color: SECONDARY,
  });
  drawRightText(
    page,
    formatCurrency(quotation.netAmount),
    totalX - 24,
    top - 31,
    fonts.medium,
    9,
    INK,
  );
  page.drawText("IVA 19%", {
    x: LEFT,
    y: top - 57,
    font: fonts.regular,
    size: 8.5,
    color: SECONDARY,
  });
  drawRightText(
    page,
    formatCurrency(quotation.taxAmount),
    totalX - 24,
    top - 57,
    fonts.medium,
    9,
    INK,
  );
  drawRule(page, top - 75, {
    start: LEFT,
    end: totalX - 24,
    color: LINE,
  });
  page.drawText("Valores expresados en pesos chilenos.", {
    x: LEFT,
    y: top - 94,
    font: fonts.regular,
    size: 6.8,
    color: MUTED,
  });

  page.drawRectangle({
    x: totalX,
    y: top - blockHeight,
    width: RIGHT - totalX,
    height: blockHeight,
    color: INK,
  });
  page.drawRectangle({
    x: totalX,
    y: top - 4,
    width: 38,
    height: 4,
    color: ACCENT,
  });
  drawLabel(
    page,
    "Inversión total · IVA incluido",
    totalX + 20,
    top - 27,
    fonts.semibold,
    PAPER_DARK,
    6.4,
  );
  drawRightText(
    page,
    formatCurrency(quotation.totalAmount),
    RIGHT - 19,
    top - 66,
    fonts.semibold,
    21.5,
    WHITE,
  );
  drawRightText(page, "CLP", RIGHT - 19, top - 88, fonts.medium, 6.4, PAPER_DARK);

  return top - blockHeight - 31;
}

function drawClosingBlock(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  y: number,
) {
  drawSectionTitle(page, "04", "Pago y siguiente paso", y, fonts);
  const top = y - 29;
  const height = 104;
  const splitX = LEFT + 304;

  page.drawRectangle({
    x: LEFT,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: INK,
  });
  page.drawRectangle({
    x: LEFT,
    y: top - height,
    width: 5,
    height,
    color: ACCENT,
  });
  page.drawLine({
    start: { x: splitX, y: top - 19 },
    end: { x: splitX, y: top - height + 18 },
    thickness: 0.45,
    color: rgb(0.27, 0.255, 0.23),
  });

  drawLabel(page, "Datos para pago", LEFT + 20, top - 21, fonts.semibold, ACCENT, 6.4);
  page.drawText(VIALOOP_PAYMENT_DETAILS.holder, {
    x: LEFT + 20,
    y: top - 43,
    font: fonts.semibold,
    size: 8.8,
    color: WHITE,
  });
  page.drawText(`RUT ${VIALOOP_PAYMENT_DETAILS.taxId}`, {
    x: LEFT + 20,
    y: top - 59,
    font: fonts.regular,
    size: 6.8,
    color: PAPER_DARK,
  });
  page.drawText(
    `${VIALOOP_PAYMENT_DETAILS.institution} · ${VIALOOP_PAYMENT_DETAILS.accountType}`,
    {
      x: LEFT + 145,
      y: top - 43,
      font: fonts.medium,
      size: 7.5,
      color: WHITE,
    },
  );
  page.drawText(`Cuenta ${VIALOOP_PAYMENT_DETAILS.accountNumber}`, {
    x: LEFT + 145,
    y: top - 59,
    font: fonts.semibold,
    size: 8.1,
    color: WHITE,
  });
  page.drawText(`Comprobante: ${VIALOOP_PAYMENT_DETAILS.email}`, {
    x: LEFT + 20,
    y: top - 84,
    font: fonts.regular,
    size: 6.9,
    color: PAPER_DARK,
  });

  const actionX = splitX + 19;
  drawLabel(page, "Siguiente paso", actionX, top - 21, fonts.semibold, ACCENT, 6.4);
  page.drawText("Aprobar o solicitar ajustes", {
    x: actionX,
    y: top - 44,
    font: fonts.semibold,
    size: 9.2,
    color: WHITE,
  });
  page.drawText("Responda directamente al correo", {
    x: actionX,
    y: top - 62,
    font: fonts.regular,
    size: 6.8,
    color: PAPER_DARK,
  });
  page.drawText(cleanText(quotation.senderName), {
    x: actionX,
    y: top - 81,
    font: fonts.medium,
    size: 7.2,
    color: WHITE,
  });
  page.drawText(cleanText(quotation.senderEmail), {
    x: actionX,
    y: top - 94,
    font: fonts.regular,
    size: 6.4,
    color: PAPER_DARK,
  });

  return top - height;
}

export async function createQuotationPdf(quotation: QuotationMetadata) {
  const document = await PDFDocument.create();
  const [regularBytes, mediumBytes, semiboldBytes] = await loadFontFiles();

  document.registerFontkit(fontkit);

  const fonts: PdfFonts = {
    regular: await document.embedFont(regularBytes, { subset: true }),
    medium: await document.embedFont(mediumBytes, { subset: true }),
    semibold: await document.embedFont(semiboldBytes, { subset: true }),
  };
  const logo = await document.embedPng(vialoopLogoPng);

  document.setTitle(`Cotización ${quotation.number}`);
  document.setAuthor("Vialoop Studio SpA");
  document.setSubject(quotation.projectName || "Propuesta comercial");
  document.setCreator("Portal Vialoop");
  document.setProducer("Vialoop Studio SpA");
  document.setLanguage("es-CL");

  const pages: PDFPage[] = [];
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawPageBase(page, fonts, logo, quotation);

  const addPage = (label: string, includeItemsHeader = false) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawPageBase(page, fonts, logo, quotation, label);
    let nextY = PAGE_HEIGHT - 181;

    if (includeItemsHeader) {
      nextY = drawItemsHeader(page, fonts, nextY);
    }

    return nextY;
  };

  let y = PAGE_HEIGHT - 119;
  drawLabel(page, "Propuesta comercial / 2026", LEFT, y, fonts.semibold, ACCENT, 7.1);
  y -= 31;

  const projectTitle = quotation.projectName || "Propuesta comercial";
  const title = fittedTitle(projectTitle, fonts.semibold);
  const titleLineHeight = title.size * 1.04;

  title.lines.forEach((line, index) => {
    page.drawText(line, {
      x: LEFT,
      y: y - index * titleLineHeight,
      font: fonts.semibold,
      size: title.size,
      color: INK,
    });
  });
  y -= title.lines.length * titleLineHeight + 12;

  const intro = `Propuesta preparada para ${quotation.clientName}. Alcance, inversión y condiciones presentados para una decisión clara.`;
  const introLines = wrapText(intro, fonts.regular, 9.2, CONTENT_WIDTH - 110).slice(0, 3);
  introLines.forEach((line, index) => {
    page.drawText(line, {
      x: LEFT,
      y: y - index * 12.4,
      font: fonts.regular,
      size: 9.2,
      color: SECONDARY,
    });
  });
  y -= introLines.length * 12.4 + 16;

  const metaTop = y;
  drawRule(page, metaTop, { thickness: 0.9, color: INK });

  const clientX = LEFT;
  const issuedX = LEFT + 284;
  const validX = LEFT + 391;
  drawLabel(page, "Preparada para", clientX, metaTop - 18, fonts.semibold);
  const clientLines = wrapText(quotation.clientName, fonts.semibold, 11.2, 254).slice(
    0,
    2,
  );
  clientLines.forEach((line, index) => {
    page.drawText(line, {
      x: clientX,
      y: metaTop - 39 - index * 13,
      font: fonts.semibold,
      size: 11.2,
      color: INK,
    });
  });
  const contact = quotation.contactName || quotation.recipientEmail;
  page.drawText(cleanText(contact), {
    x: clientX,
    y: metaTop - 65,
    font: fonts.regular,
    size: 7.2,
    color: MUTED,
  });

  drawLabel(page, "Emisión", issuedX, metaTop - 18, fonts.semibold);
  const issuedLines = wrapText(formatDate(quotation.issuedAt), fonts.medium, 8, 86).slice(
    0,
    2,
  );
  issuedLines.forEach((line, index) => {
    page.drawText(line, {
      x: issuedX,
      y: metaTop - 39 - index * 11,
      font: fonts.medium,
      size: 8,
      color: INK,
    });
  });

  drawLabel(page, "Vigencia", validX, metaTop - 18, fonts.semibold);
  const validLines = wrapText(
    `Hasta ${formatDate(quotation.validUntil)}`,
    fonts.medium,
    8,
    RIGHT - validX,
  ).slice(0, 2);
  validLines.forEach((line, index) => {
    page.drawText(line, {
      x: validX,
      y: metaTop - 39 - index * 11,
      font: fonts.medium,
      size: 8,
      color: INK,
    });
  });
  drawRule(page, metaTop - 74, { color: INK });
  y = metaTop - 102;

  drawSectionTitle(page, "01", "Alcance propuesto", y, fonts);
  y = drawItemsHeader(page, fonts, y - 27);

  quotation.items.forEach((item, itemIndex) => {
    const metrics = itemMetrics(item, fonts);

    if (y - metrics.rowHeight < FOOTER_LIMIT + 10) {
      y = addPage("Alcance / continuación", true);
    }

    y = drawItem(page, fonts, item, itemIndex, y, metrics);
  });

  drawRule(page, y, { thickness: 0.9, color: INK });
  y -= 32;

  if (y < 235) {
    y = addPage("Resumen comercial");
  }

  y = drawInvestment(page, fonts, quotation, y);

  const notesText = quotation.notes.trim()
    ? quotation.notes
    : "Valores expresados en pesos chilenos. La propuesta considera los servicios indicados y la vigencia señalada.";
  const noteColumnGap = 32;
  const noteColumnWidth = (CONTENT_WIDTH - noteColumnGap) / 2;
  let noteLines = wrapText(notesText, fonts.regular, 7.75, noteColumnWidth - 15);
  let continuation = false;

  while (noteLines.length > 0) {
    const reserveAfterNotes = noteLines.length <= 24 ? 132 : 72;
    const availableRows = Math.floor(
      (y - FOOTER_LIMIT - reserveAfterNotes - 40) / 10.2,
    );

    if (availableRows < 4) {
      y = addPage(
        continuation ? "Condiciones / continuación" : "Condiciones comerciales",
      );
      continuation = true;
      continue;
    }

    drawSectionTitle(
      page,
      "03",
      continuation ? "Condiciones / continuación" : "Condiciones comerciales",
      y,
      fonts,
    );
    y -= 30;

    const rowsToDraw = Math.min(availableRows, Math.ceil(noteLines.length / 2));
    const currentLines = noteLines.slice(0, rowsToDraw * 2);
    noteLines = noteLines.slice(currentLines.length);
    const { left: leftLines, right: rightLines } = splitBalancedColumns(
      currentLines,
      availableRows,
    );
    const noteTop = y;
    const secondColumnX = LEFT + noteColumnWidth + noteColumnGap;

    [
      { lines: leftLines, ruleX: LEFT, textX: LEFT + 14 },
      {
        lines: rightLines,
        ruleX: secondColumnX,
        textX: secondColumnX + 14,
      },
    ].forEach((column) => {
      let columnY = noteTop;

      column.lines.forEach((line) => {
        if (line) {
          page.drawText(line, {
            x: column.textX,
            y: columnY,
            font: fonts.regular,
            size: 7.75,
            color: SECONDARY,
          });
        }
        columnY -= 10.2;
      });

      if (column.lines.length > 0) {
        page.drawLine({
          start: { x: column.ruleX, y: noteTop + 3 },
          end: { x: column.ruleX, y: columnY + 4 },
          thickness: 2.1,
          color: ACCENT,
        });
      }
    });

    y -= Math.max(leftLines.length, rightLines.length) * 10.2 + 21;
    continuation = true;

    if (noteLines.length > 0) {
      y = addPage("Condiciones / continuación");
    }
  }

  if (y < 172) {
    y = addPage("Cierre de propuesta");
  }

  drawClosingBlock(page, fonts, quotation, y);

  pages.forEach((currentPage, index) => {
    drawFooter(currentPage, fonts, quotation, index + 1, pages.length);
  });

  return Buffer.from(await document.save());
}
