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

export type ProspectMetadata = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  industry: string;
  source: string;
  status: ProspectStatus;
  interest: string;
  nextFollowUp: string;
  assignedTo: string;
  notes: string;
  updatedAt: string;
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
    nextFollowUp: stringValue(
      value.nextFollowUp,
    ),
    assignedTo: stringValue(
      value.assignedTo,
    ),
    notes: stringValue(value.notes),
    updatedAt: stringValue(
      value.updatedAt,
    ),
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

export function buildProspectMessage(
  prospect: ProspectMetadata,
) {
  const greeting = prospect.contactName
    ? `Hola ${prospect.contactName}`
    : "Hola";

  const service = prospect.interest
    ? ` sobre ${prospect.interest}`
    : "";

  if (prospect.status === "CONTACTED") {
    return `${greeting}, ¿cómo estás? Quería retomar nuestra conversación${service} y saber si necesitas que aclaremos algún punto. Quedo atento/a para avanzar cuando te acomode.`;
  }

  if (
    prospect.status === "FOLLOW_UP" ||
    prospect.status === "LATER"
  ) {
    return `${greeting}, espero que estés muy bien. Te escribo para retomar la propuesta${service}. Si el proyecto sigue vigente, podemos revisar alcance, plazos y próximos pasos en una breve reunión.`;
  }

  if (prospect.status === "WON") {
    return `${greeting}, muchas gracias por confiar en Vialoop. Estamos listos para coordinar el inicio del proyecto${service} y compartirte los próximos pasos.`;
  }

  return `${greeting}, soy parte del equipo de Vialoop. Ayudamos a empresas con diseño web, desarrollo de software y hosting. Me gustaría conocer lo que necesitan${service} y evaluar una solución adecuada para ${prospect.company}.`;
}
