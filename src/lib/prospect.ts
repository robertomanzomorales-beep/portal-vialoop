export const prospectStatuses = [
  "NEW",
  "CONTACTED",
  "FOLLOW_UP",
  "LATER",
  "WON",
  "LOST",
] as const;

export type ProspectStatus =
  (typeof prospectStatuses)[number];

export type ProspectQuotationItem = {
  description: string;
  quantity: number;
};

export type ProspectQuotation = {
  id: string;
  number: string;
  projectName: string;
  recipientEmail: string;
  items: ProspectQuotationItem[];
  totalAmount: number;
  issuedAt: string;
  validUntil: string;
  pdfPath: string;
};

export type ProspectActivity = {
  id: string;
  contactedAt: string;
  nextFollowUp: string;
  action: string;
  note: string;
  responsible: string;
  createdAt: string;
};

export type ProspectMetadata = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  industry: string;
  source: string;
  status: ProspectStatus;
  interest: string;
  lastContactAt: string;
  nextFollowUp: string;
  nextAction: string;
  assignedTo: string;
  notes: string;
  updatedAt: string;
  quotations: ProspectQuotation[];
  activities: ProspectActivity[];
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

function stringValue(
  value: unknown,
) {
  return typeof value === "string"
    ? value
    : "";
}

function parseProspectQuotation(
  value: unknown,
): ProspectQuotation | null {
  if (!isObject(value)) {
    return null;
  }

  const id = stringValue(value.id).trim();
  const number = stringValue(
    value.number,
  ).trim();

  if (!id || !number) {
    return null;
  }

  const items = Array.isArray(value.items)
    ? value.items
        .filter(isObject)
        .map((item) => ({
          description: stringValue(
            item.description,
          ).trim(),
          quantity: Math.max(
            1,
            Math.round(
              Number(item.quantity) || 1,
            ),
          ),
        }))
        .filter(
          (item) =>
            item.description.length > 0,
        )
        .slice(0, 20)
    : [];

  return {
    id,
    number,
    projectName: stringValue(
      value.projectName,
    ),
    recipientEmail: stringValue(
      value.recipientEmail,
    ),
    items,
    totalAmount: Math.max(
      0,
      Number(value.totalAmount) || 0,
    ),
    issuedAt: stringValue(
      value.issuedAt,
    ),
    validUntil: stringValue(
      value.validUntil,
    ),
    pdfPath:
      stringValue(value.pdfPath) ||
      `/api/cotizaciones/${id}/pdf`,
  };
}

function parseProspectActivity(value: unknown): ProspectActivity | null {
  if (!isObject(value)) {
    return null;
  }

  const id = stringValue(value.id).trim();
  const contactedAt = stringValue(value.contactedAt).trim();
  const action = stringValue(value.action).trim();

  if (!id || !contactedAt || !action) {
    return null;
  }

  return {
    id,
    contactedAt,
    nextFollowUp: stringValue(value.nextFollowUp),
    action,
    note: stringValue(value.note),
    responsible: stringValue(value.responsible),
    createdAt: stringValue(value.createdAt),
  };
}

export function isProspectStatus(
  value: unknown,
): value is ProspectStatus {
  return prospectStatuses.includes(
    value as ProspectStatus,
  );
}

export function parseProspectMetadata(
  value: unknown,
): ProspectMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  const company = stringValue(
    value.company,
  ).trim();

  if (!company) {
    return null;
  }

  return {
    company,
    contactName: stringValue(
      value.contactName,
    ),
    email: stringValue(value.email),
    phone: stringValue(value.phone),
    industry: stringValue(
      value.industry,
    ),
    source: stringValue(value.source),
    status: isProspectStatus(
      value.status,
    )
      ? value.status
      : "NEW",
    interest: stringValue(
      value.interest,
    ),
    lastContactAt: stringValue(
      value.lastContactAt,
    ),
    nextFollowUp: stringValue(
      value.nextFollowUp,
    ),
    nextAction: stringValue(
      value.nextAction,
    ),
    assignedTo: stringValue(
      value.assignedTo,
    ),
    notes: stringValue(value.notes),
    updatedAt: stringValue(
      value.updatedAt,
    ),
    quotations: Array.isArray(
      value.quotations,
    )
      ? value.quotations
          .map(parseProspectQuotation)
          .filter(
            (
              quotation,
            ): quotation is ProspectQuotation =>
              Boolean(quotation),
          )
          .slice(0, 20)
      : [],
    activities: Array.isArray(value.activities)
      ? value.activities
          .map(parseProspectActivity)
          .filter(
            (activity): activity is ProspectActivity => Boolean(activity),
          )
          .slice(0, 100)
      : [],
  };
}

export function getProspectStatusLabel(
  status: ProspectStatus,
) {
  return {
    NEW: "Nuevo",
    CONTACTED: "Contactado",
    FOLLOW_UP: "En seguimiento",
    LATER: "Para más adelante",
    WON: "Ganado",
    LOST: "Perdido",
  }[status];
}
