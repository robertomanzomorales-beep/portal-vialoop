import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { vialoopReferenceLogoPng } from "@/lib/vialoop-reference-logo";
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
  clientTaxId?: string;
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
  followUpId?: string;
  followUpRegisteredAt?: string;
  followUpDismissedAt?: string;
  expiryNotificationSentAt?: string;
  expiryNotificationMessageId?: string;
  expiryNotificationLastAttemptAt?: string;
  expiryNotificationLastError?: string;
};

type PdfFonts = {
  regular: PDFFont;
  medium: PDFFont;
  semibold: PDFFont;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 39;
const RIGHT = PAGE_WIDTH - 39;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_TOP = 55;

const INK = rgb(0.063, 0.094, 0.157);
const BODY = rgb(0.204, 0.251, 0.329);
const MUTED = rgb(0.4, 0.451, 0.522);
const LINE = rgb(0.835, 0.855, 0.882);
const LIGHT_LINE = rgb(0.918, 0.929, 0.945);
const SOFT = rgb(0.953, 0.961, 0.973);
const BLUE_SOFT = rgb(0.961, 0.976, 1);
const BLUE = rgb(0.145, 0.431, 0.78);
const LOGO_BLUE = rgb(0.173, 0.639, 0.867);
const RED = rgb(0.91, 0.075, 0.106);
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
    clientTaxId:
      typeof value.clientTaxId === "string" ? value.clientTaxId : undefined,
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
    followUpId:
      typeof value.followUpId === "string"
        ? value.followUpId
        : undefined,
    followUpRegisteredAt:
      typeof value.followUpRegisteredAt === "string"
        ? value.followUpRegisteredAt
        : undefined,
    followUpDismissedAt:
      typeof value.followUpDismissedAt === "string"
        ? value.followUpDismissedAt
        : undefined,
    expiryNotificationSentAt:
      typeof value.expiryNotificationSentAt === "string"
        ? value.expiryNotificationSentAt
        : undefined,
    expiryNotificationMessageId:
      typeof value.expiryNotificationMessageId === "string"
        ? value.expiryNotificationMessageId
        : undefined,
    expiryNotificationLastAttemptAt:
      typeof value.expiryNotificationLastAttemptAt === "string"
        ? value.expiryNotificationLastAttemptAt
        : undefined,
    expiryNotificationLastError:
      typeof value.expiryNotificationLastError === "string"
        ? value.expiryNotificationLastError
        : undefined,
  };
}

function cleanText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\t/g, " ")
    .replace(/[–—]/g, "-");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactDate(value: string) {
  if (!value) {
    return "No informa";
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
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
      const parts =
        font.widthOfTextAtSize(rawWord, size) > maximumWidth
          ? splitLongWord(rawWord, font, size, maximumWidth)
          : [rawWord];

      for (const word of parts) {
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

function ellipsizeLine(
  line: string,
  font: PDFFont,
  size: number,
  maximumWidth: number,
) {
  let value = line;

  while (
    value.length > 1 &&
    font.widthOfTextAtSize(`${value}...`, size) > maximumWidth
  ) {
    value = value.slice(0, -1);
  }

  return `${value.trimEnd()}...`;
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

function drawCell({
  page,
  text,
  x,
  top,
  width,
  height,
  font,
  size,
  color = INK,
  fill = WHITE,
  align = "left",
  padding = 7,
}: {
  page: PDFPage;
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  fill?: ReturnType<typeof rgb>;
  align?: "left" | "center" | "right";
  padding?: number;
}) {
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    color: fill,
    borderColor: LINE,
    borderWidth: 0.55,
  });

  const lines = wrapText(text || "No informa", font, size, width - padding * 2);
  const lineHeight = size * 1.22;
  const maximumLines = Math.max(1, Math.floor((height - 8) / lineHeight));
  const visible = lines.slice(0, maximumLines);

  if (lines.length > visible.length) {
    visible[visible.length - 1] = ellipsizeLine(
      visible[visible.length - 1],
      font,
      size,
      width - padding * 2,
    );
  }

  const totalHeight = visible.length * lineHeight;
  let y = top - (height - totalHeight) / 2 - size;

  visible.forEach((line) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const textX =
      align === "center"
        ? x + (width - lineWidth) / 2
        : align === "right"
          ? x + width - padding - lineWidth
          : x + padding;

    page.drawText(line, {
      x: textX,
      y,
      font,
      size,
      color,
    });
    y -= lineHeight;
  });
}

function drawFooter(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  pageNumber: number,
  pageCount: number,
) {
  drawRule(page, 41, { thickness: 0.8, color: LOGO_BLUE });
  page.drawText("VIALOOP STUDIO SPA", {
    x: LEFT,
    y: 24,
    font: fonts.semibold,
    size: 6.4,
    color: BODY,
  });
  page.drawText("vialoop.cl", {
    x: LEFT + 112,
    y: 24,
    font: fonts.regular,
    size: 6.4,
    color: MUTED,
  });
  drawRightText(
    page,
    `${quotation.number} · ${pageNumber} / ${pageCount}`,
    RIGHT,
    24,
    fonts.medium,
    6.4,
    MUTED,
  );
}

function drawContinuationHeader(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  label: string,
) {
  page.drawText("VIALOOP STUDIO SPA", {
    x: LEFT,
    y: PAGE_HEIGHT - 49,
    font: fonts.semibold,
    size: 9.2,
    color: BLUE,
  });
  page.drawText(cleanText(label), {
    x: LEFT,
    y: PAGE_HEIGHT - 66,
    font: fonts.medium,
    size: 7.4,
    color: MUTED,
  });
  drawRightText(
    page,
    `Cotización N.º ${quotation.number}`,
    RIGHT,
    PAGE_HEIGHT - 56,
    fonts.semibold,
    8.2,
    INK,
  );
  drawRule(page, PAGE_HEIGHT - 79, { thickness: 0.9, color: LOGO_BLUE });

  return PAGE_HEIGHT - 106;
}

function drawPageOneHeader(
  page: PDFPage,
  fonts: PdfFonts,
  logo: PDFImage,
  quotation: QuotationMetadata,
) {
  const logoWidth = 107;
  const logoHeight = (logo.height / logo.width) * logoWidth;

  page.drawImage(logo, {
    x: LEFT + 1,
    y: PAGE_HEIGHT - 52 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  const cardWidth = 174;
  const cardHeight = 105;
  const cardX = RIGHT - cardWidth;
  const cardTop = PAGE_HEIGHT - 52;

  page.drawRectangle({
    x: cardX,
    y: cardTop - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: WHITE,
    borderColor: BLUE,
    borderWidth: 1.35,
  });
  drawCenteredText(
    page,
    `RUT: ${VIALOOP_PAYMENT_DETAILS.taxId}`,
    cardX + cardWidth / 2,
    cardTop - 26,
    fonts.semibold,
    9.8,
    BLUE,
  );

  const prefix = "Cotización N.º ";
  const prefixSize = 10.4;
  const numberSize = 10.8;
  const totalWidth =
    fonts.regular.widthOfTextAtSize(prefix, prefixSize) +
    fonts.semibold.widthOfTextAtSize(quotation.number, numberSize);
  const titleX = cardX + (cardWidth - totalWidth) / 2;

  page.drawText(prefix, {
    x: titleX,
    y: cardTop - 56,
    font: fonts.regular,
    size: prefixSize,
    color: INK,
  });
  page.drawText(cleanText(quotation.number), {
    x: titleX + fonts.regular.widthOfTextAtSize(prefix, prefixSize),
    y: cardTop - 56,
    font: fonts.semibold,
    size: numberSize,
    color: RED,
  });
  drawCenteredText(
    page,
    "VIALOOP STUDIO SPA",
    cardX + cardWidth / 2,
    cardTop - 82,
    fonts.semibold,
    8.2,
    MUTED,
  );
}

function drawClientGrid(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  top: number,
) {
  const widths = [84, 176, 115, CONTENT_WIDTH - 375];
  const rows: Array<[string, string, string, string]> = [
    [
      "Cliente:",
      quotation.clientName,
      "RUT cliente:",
      quotation.clientTaxId || "No informa",
    ],
    [
      "Contacto:",
      quotation.contactName || "No informa",
      "Responsable:",
      quotation.senderName,
    ],
    [
      "Condición:",
      "Transferencia - CLP",
      "Email responsable:",
      quotation.senderEmail,
    ],
    [
      "Emisión:",
      formatCompactDate(quotation.issuedAt),
      "Válida hasta:",
      formatCompactDate(quotation.validUntil),
    ],
  ];
  const rowHeight = 27;
  let y = top;

  rows.forEach(([labelA, valueA, labelB, valueB]) => {
    let x = LEFT;
    drawCell({ page, text: labelA, x, top: y, width: widths[0], height: rowHeight, font: fonts.semibold, size: 8.4, fill: SOFT });
    x += widths[0];
    drawCell({ page, text: valueA, x, top: y, width: widths[1], height: rowHeight, font: fonts.regular, size: 8.5 });
    x += widths[1];
    drawCell({ page, text: labelB, x, top: y, width: widths[2], height: rowHeight, font: fonts.semibold, size: 8.4, fill: SOFT });
    x += widths[2];
    drawCell({ page, text: valueB, x, top: y, width: widths[3], height: rowHeight, font: fonts.regular, size: 8.2 });
    y -= rowHeight;
  });

  const glosaHeight = 34;
  drawCell({ page, text: "Glosa:", x: LEFT, top: y, width: widths[0], height: glosaHeight, font: fonts.semibold, size: 8.4, fill: SOFT });
  drawCell({
    page,
    text: quotation.projectName || "Propuesta comercial",
    x: LEFT + widths[0],
    top: y,
    width: CONTENT_WIDTH - widths[0],
    height: glosaHeight,
    font: fonts.medium,
    size: 8.6,
  });

  return y - glosaHeight;
}

const ITEM_WIDTHS = [286, 45, 96, CONTENT_WIDTH - 427];

function drawItemsHeader(page: PDFPage, fonts: PdfFonts, top: number) {
  const labels = ["Detalle", "Cant.", "Valor unitario", "Total"];
  let x = LEFT;

  labels.forEach((label, index) => {
    drawCell({
      page,
      text: label,
      x,
      top,
      width: ITEM_WIDTHS[index],
      height: 28,
      font: fonts.semibold,
      size: 8.3,
      fill: SOFT,
      align: index === 0 ? "left" : "center",
    });
    x += ITEM_WIDTHS[index];
  });

  return top - 28;
}

function summaryRowMetrics(item: QuotationItem, fonts: PdfFonts) {
  const titleLines = wrapText(item.description, fonts.semibold, 8.9, ITEM_WIDTHS[0] - 14);
  const completeDetailLines = item.detail
    ? wrapText(item.detail, fonts.regular, 7.25, ITEM_WIDTHS[0] - 14).filter(Boolean)
    : [];
  const detailLines = completeDetailLines.slice(0, 2);

  if (completeDetailLines.length > detailLines.length && detailLines.length > 0) {
    detailLines[detailLines.length - 1] = ellipsizeLine(
      detailLines[detailLines.length - 1],
      fonts.regular,
      7.25,
      ITEM_WIDTHS[0] - 14,
    );
  }

  const height = Math.max(
    38,
    13 + titleLines.length * 10.8 + (detailLines.length ? 4 : 0) + detailLines.length * 8.8 + 10,
  );

  return { titleLines, detailLines, height };
}

function drawSummaryRow(
  page: PDFPage,
  fonts: PdfFonts,
  item: QuotationItem,
  top: number,
  metrics: ReturnType<typeof summaryRowMetrics>,
) {
  let x = LEFT;

  ITEM_WIDTHS.forEach((width) => {
    page.drawRectangle({
      x,
      y: top - metrics.height,
      width,
      height: metrics.height,
      color: WHITE,
      borderColor: LINE,
      borderWidth: 0.55,
    });
    x += width;
  });

  let textY = top - 15;
  metrics.titleLines.forEach((line) => {
    page.drawText(line, {
      x: LEFT + 7,
      y: textY,
      font: fonts.semibold,
      size: 8.9,
      color: INK,
    });
    textY -= 10.8;
  });

  if (metrics.detailLines.length > 0) {
    textY -= 1;
    metrics.detailLines.forEach((line) => {
      page.drawText(line, {
        x: LEFT + 7,
        y: textY,
        font: fonts.regular,
        size: 7.25,
        color: MUTED,
      });
      textY -= 8.8;
    });
  }

  drawCenteredText(
    page,
    String(item.quantity),
    LEFT + ITEM_WIDTHS[0] + ITEM_WIDTHS[1] / 2,
    top - metrics.height / 2 - 3,
    fonts.medium,
    8.3,
    BODY,
  );
  drawRightText(
    page,
    formatCurrency(item.unitPrice),
    LEFT + ITEM_WIDTHS[0] + ITEM_WIDTHS[1] + ITEM_WIDTHS[2] - 7,
    top - metrics.height / 2 - 3,
    fonts.regular,
    8.1,
    BODY,
  );
  drawRightText(
    page,
    formatCurrency(item.quantity * item.unitPrice),
    RIGHT - 7,
    top - metrics.height / 2 - 3,
    fonts.semibold,
    8.3,
    INK,
  );

  return top - metrics.height;
}

function drawTotalsBlock(
  page: PDFPage,
  fonts: PdfFonts,
  quotation: QuotationMetadata,
  top: number,
) {
  const height = 84;
  const noteWidth = 373;
  const labelWidth = 64;
  const valueWidth = CONTENT_WIDTH - noteWidth - labelWidth;

  page.drawRectangle({
    x: LEFT,
    y: top - height,
    width: noteWidth,
    height,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.55,
  });
  page.drawText("CONDICIONES DEL RESUMEN", {
    x: LEFT + 7,
    y: top - 14,
    font: fonts.semibold,
    size: 6.1,
    color: MUTED,
  });
  const disclaimer =
    "Los valores consideran exclusivamente el alcance indicado. Todo requerimiento adicional se cotizará por separado. La propuesta mantiene su vigencia hasta la fecha señalada.";
  const disclaimerLines = wrapText(disclaimer, fonts.regular, 7.1, noteWidth - 14).slice(0, 6);

  disclaimerLines.forEach((line, index) => {
    page.drawText(line, {
      x: LEFT + 7,
      y: top - 31 - index * 9.2,
      font: fonts.regular,
      size: 7.1,
      color: BODY,
    });
  });

  const totals: Array<[string, string]> = [
    ["Neto:", formatCurrency(quotation.netAmount)],
    ["IVA (19%):", formatCurrency(quotation.taxAmount)],
    ["Total:", formatCurrency(quotation.totalAmount)],
  ];
  const rowHeight = height / 3;

  totals.forEach(([label, value], index) => {
    const rowTop = top - index * rowHeight;
    const totalRow = index === 2;
    drawCell({
      page,
      text: label,
      x: LEFT + noteWidth,
      top: rowTop,
      width: labelWidth,
      height: rowHeight,
      font: fonts.semibold,
      size: 8.2,
      fill: totalRow ? BLUE_SOFT : SOFT,
    });
    drawCell({
      page,
      text: value,
      x: LEFT + noteWidth + labelWidth,
      top: rowTop,
      width: valueWidth,
      height: rowHeight,
      font: fonts.semibold,
      size: totalRow ? 9.1 : 8.2,
      color: totalRow ? BLUE : INK,
      align: "right",
    });
  });

  return top - height;
}

function drawSectionHeading(
  page: PDFPage,
  fonts: PdfFonts,
  title: string,
  y: number,
) {
  page.drawText(cleanText(title), {
    x: LEFT,
    y,
    font: fonts.semibold,
    size: 14.2,
    color: INK,
  });
  const lineWidth = Math.min(
    CONTENT_WIDTH,
    fonts.semibold.widthOfTextAtSize(cleanText(title), 14.2) + 12,
  );
  drawRule(page, y - 7, {
    end: LEFT + lineWidth,
    thickness: 1.35,
    color: LOGO_BLUE,
  });

  return y - 29;
}

function detailEntries(detail: string) {
  const entries = cleanText(detail)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[•*\-]\s*/, "").trim())
    .filter(Boolean);

  return entries.length > 0
    ? entries
    : ["El alcance corresponde a la descripción indicada en el resumen económico."];
}

function noteEntries(notes: string) {
  return cleanText(notes)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      bullet: /^[•*\-]\s*/.test(line),
      heading: line.endsWith(":"),
      text: line.replace(/^[•*\-]\s*/, "").trim(),
    }));
}

function drawPaymentBlock(
  page: PDFPage,
  fonts: PdfFonts,
  top: number,
) {
  const boxHeight = 88;
  const half = CONTENT_WIDTH / 2;

  page.drawRectangle({
    x: LEFT,
    y: top - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    color: BLUE_SOFT,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  page.drawLine({
    start: { x: LEFT + half, y: top - 13 },
    end: { x: LEFT + half, y: top - boxHeight + 13 },
    thickness: 0.55,
    color: LINE,
  });

  const leftRows: Array<[string, string]> = [
    ["Titular", VIALOOP_PAYMENT_DETAILS.holder],
    ["RUT", VIALOOP_PAYMENT_DETAILS.taxId],
    ["Correo", VIALOOP_PAYMENT_DETAILS.email],
  ];
  const rightRows: Array<[string, string]> = [
    ["Banco", VIALOOP_PAYMENT_DETAILS.institution],
    ["Tipo de cuenta", VIALOOP_PAYMENT_DETAILS.accountType],
    ["N.º de cuenta", VIALOOP_PAYMENT_DETAILS.accountNumber],
  ];

  [leftRows, rightRows].forEach((rows, columnIndex) => {
    const x = LEFT + columnIndex * half + 16;
    rows.forEach(([label, value], rowIndex) => {
      const y = top - 20 - rowIndex * 23;
      page.drawText(label.toUpperCase(), {
        x,
        y,
        font: fonts.semibold,
        size: 5.8,
        color: MUTED,
      });
      page.drawText(cleanText(value), {
        x: x + 72,
        y: y - 1,
        font: fonts.medium,
        size: 7.8,
        color: INK,
      });
    });
  });

  return top - boxHeight;
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
  const logo = await document.embedPng(vialoopReferenceLogoPng);

  document.setTitle(`Cotización ${quotation.number}`);
  document.setAuthor("Vialoop Studio SpA");
  document.setSubject(quotation.projectName || "Propuesta comercial");
  document.setCreator("Portal Vialoop");
  document.setProducer("Vialoop Studio SpA");
  document.setLanguage("es-CL");

  const pages: PDFPage[] = [];
  const addBlankPage = () => {
    const next = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(next);
    next.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: WHITE });
    return next;
  };

  let page = addBlankPage();
  drawPageOneHeader(page, fonts, logo, quotation);
  let y = drawClientGrid(page, fonts, quotation, PAGE_HEIGHT - 198) - 17;
  y = drawItemsHeader(page, fonts, y);

  quotation.items.forEach((item, itemIndex) => {
    const metrics = summaryRowMetrics(item, fonts);
    const isLastItem = itemIndex === quotation.items.length - 1;
    const closingReserve = isLastItem ? 112 : 0;

    if (y - metrics.height < FOOTER_TOP + 20 + closingReserve) {
      page = addBlankPage();
      y = drawContinuationHeader(page, fonts, quotation, "Resumen económico / continuación") - 10;
      y = drawItemsHeader(page, fonts, y);
    }

    y = drawSummaryRow(page, fonts, item, y, metrics);
  });

  y -= 14;
  if (y - 84 < FOOTER_TOP + 14) {
    page = addBlankPage();
    y = drawContinuationHeader(page, fonts, quotation, "Resumen económico") - 14;
  }
  drawTotalsBlock(page, fonts, quotation, y);

  page = addBlankPage();
  y = drawContinuationHeader(page, fonts, quotation, "Alcance detallado");
  y = drawSectionHeading(page, fonts, "Detalle de los productos", y);
  const intro = quotation.projectName || "Servicios incluidos en la propuesta";
  const introLines = wrapText(intro, fonts.regular, 10.2, CONTENT_WIDTH);

  introLines.forEach((line) => {
    page.drawText(line, {
      x: LEFT,
      y,
      font: fonts.regular,
      size: 10.2,
      color: BODY,
    });
    y -= 13.5;
  });
  y -= 17;

  const newDetailPage = (label: string) => {
    page = addBlankPage();
    y = drawContinuationHeader(page, fonts, quotation, label);
  };

  quotation.items.forEach((item, itemIndex) => {
    const titleLines = wrapText(item.description, fonts.semibold, 11.2, CONTENT_WIDTH - 36);
    const titleHeight = titleLines.length * 13.5 + 22;

    if (y - titleHeight < FOOTER_TOP + 25) {
      newDetailPage("Detalle de productos / continuación");
    }

    page.drawCircle({
      x: LEFT + 9,
      y: y + 4,
      size: 9,
      color: BLUE_SOFT,
      borderColor: LOGO_BLUE,
      borderWidth: 0.7,
    });
    drawCenteredText(
      page,
      String(itemIndex + 1),
      LEFT + 9,
      y + 1.4,
      fonts.semibold,
      6.5,
      BLUE,
    );

    let titleY = y;
    titleLines.forEach((line) => {
      page.drawText(line, {
        x: LEFT + 27,
        y: titleY,
        font: fonts.semibold,
        size: 11.2,
        color: INK,
      });
      titleY -= 13.5;
    });
    y = titleY - 8;

    detailEntries(item.detail).forEach((entry) => {
      const lines = wrapText(entry, fonts.regular, 9.2, CONTENT_WIDTH - 34);
      const requiredHeight = lines.length * 12.6 + 7;

      if (y - requiredHeight < FOOTER_TOP + 10) {
        newDetailPage(`${item.description} / continuación`);
      }

      page.drawCircle({
        x: LEFT + 7,
        y: y + 3.5,
        size: 1.7,
        color: LOGO_BLUE,
      });
      lines.forEach((line) => {
        page.drawText(line, {
          x: LEFT + 19,
          y,
          font: fonts.regular,
          size: 9.2,
          color: BODY,
        });
        y -= 12.6;
      });
      y -= 5;
    });

    y -= 7;
    drawRule(page, y, { color: LIGHT_LINE });
    y -= 20;
  });

  const conditions = noteEntries(quotation.notes);

  if (y < FOOTER_TOP + 105) {
    newDetailPage("Condiciones comerciales");
  }
  y = drawSectionHeading(page, fonts, "Condiciones comerciales", y);

  if (conditions.length === 0) {
    conditions.push({
      bullet: false,
      heading: false,
      text: "La propuesta considera los servicios indicados y la vigencia señalada.",
    });
  }

  conditions.forEach((entry) => {
    const font = entry.heading ? fonts.semibold : fonts.regular;
    const size = entry.heading ? 9.7 : 9.1;
    const inset = entry.bullet ? 19 : 0;
    const lines = wrapText(entry.text, font, size, CONTENT_WIDTH - inset);
    const requiredHeight = lines.length * 12.6 + (entry.heading ? 8 : 5);

    if (y - requiredHeight < FOOTER_TOP + 12) {
      newDetailPage("Condiciones comerciales / continuación");
    }

    if (entry.bullet) {
      page.drawCircle({
        x: LEFT + 7,
        y: y + 3.4,
        size: 1.7,
        color: LOGO_BLUE,
      });
    }

    lines.forEach((line) => {
      page.drawText(line, {
        x: LEFT + inset,
        y,
        font,
        size,
        color: entry.heading ? INK : BODY,
      });
      y -= 12.6;
    });
    y -= entry.heading ? 8 : 5;
  });

  if (y < FOOTER_TOP + 140) {
    newDetailPage("Datos para realizar el pago");
  }
  y -= 11;
  y = drawSectionHeading(page, fonts, "Datos para realizar el pago", y);
  drawPaymentBlock(page, fonts, y);

  pages.forEach((currentPage, index) => {
    drawFooter(currentPage, fonts, quotation, index + 1, pages.length);
  });

  return Buffer.from(await document.save());
}
