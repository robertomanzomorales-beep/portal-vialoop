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
  quotations: ProspectQuotation[];
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

export function buildProspectMessages(
  prospect: ProspectMetadata,
) {
  const greeting = prospect.contactName
    ? `Hola ${prospect.contactName}`
    : "Hola";

  const service = prospect.interest.trim()
    ? ` sobre ${prospect.interest.trim()}`
    : "";

  const reviewedContext = prospect.notes.trim()
    ? "Revisé los antecedentes que conversamos y"
    : "Quisiera";

  const signature = [
    "Saludos cordiales,",
    "Equipo Vialoop",
    "Diseño web · Sistemas · Hosting",
  ].join("\n");

  const latestQuotation =
    prospect.quotations[0];

  if (
    prospect.status === "FOLLOW_UP" &&
    latestQuotation
  ) {
    const quotationContext =
      latestQuotation.projectName.trim() ||
      latestQuotation.items
        .map((item) => item.description)
        .slice(0, 2)
        .join(" y ") ||
      "el proyecto conversado";

    return {
      whatsapp: `${greeting}, ¿cómo estás? Quería saber si pudiste revisar la cotización ${latestQuotation.number} para ${quotationContext}. Si tienes dudas o comentarios, con gusto los revisamos. Si está conforme, coordinamos los próximos pasos.`,
      emailSubject: `Seguimiento cotización ${latestQuotation.number} · ${prospect.company}`,
      emailBody: [
        `${greeting},`,
        "",
        `Quería saber si pudiste revisar la cotización ${latestQuotation.number} que preparamos para ${quotationContext}.`,
        "",
        "Quedo disponible para resolver dudas, revisar comentarios o ajustar algún punto del alcance. Si la propuesta está conforme, podemos coordinar los próximos pasos para comenzar.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (prospect.status === "CONTACTED") {
    return {
      whatsapp: `${greeting}, ¿cómo estás? Quería retomar nuestra conversación${service} y saber si necesitas que aclaremos algún punto. Podemos coordinar una breve llamada cuando te acomode.`,
      emailSubject: `Seguimiento de nuestra conversación · ${prospect.company}`,
      emailBody: [
        `${greeting},`,
        "",
        `${reviewedContext} retomar nuestra conversación${service}. Quedo disponible para resolver dudas, ajustar el alcance o revisar los próximos pasos.`,
        "",
        "Si te parece, podemos coordinar una breve reunión y avanzar con una propuesta alineada a lo que necesita tu empresa.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (
    prospect.status === "FOLLOW_UP" ||
    prospect.status === "LATER"
  ) {
    return {
      whatsapp: `${greeting}, espero que estés muy bien. Te escribo para retomar la propuesta${service}. Si el proyecto sigue vigente, podemos revisar alcance, plazos y próximos pasos en una breve reunión.`,
      emailSubject: `Retomemos tu proyecto${service} · Vialoop`,
      emailBody: [
        `${greeting},`,
        "",
        `Tal como conversamos, te contacto para retomar el proyecto${service}. Podemos actualizar el alcance, los plazos o la propuesta según las prioridades actuales de ${prospect.company}.`,
        "",
        "En Vialoop nos especializamos en diseño web, desarrollo de software y hosting, por lo que podemos acompañar tanto la implementación como la continuidad del servicio.",
        "",
        "Quedo atento para coordinar una breve reunión o enviarte la información que necesites.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (prospect.status === "WON") {
    return {
      whatsapp: `${greeting}, muchas gracias por confiar en Vialoop. Estamos listos para coordinar el inicio del proyecto${service} y compartirte los próximos pasos.`,
      emailSubject: `Próximos pasos de tu proyecto · ${prospect.company}`,
      emailBody: [
        `${greeting},`,
        "",
        `Muchas gracias por confiar en Vialoop para avanzar${service}. Estamos listos para coordinar el inicio y ordenar contigo los próximos hitos del proyecto.`,
        "",
        "Te contactaremos con el calendario de trabajo, los antecedentes necesarios y las personas responsables de cada etapa.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (prospect.status === "LOST") {
    return {
      whatsapp: `${greeting}, gracias por el tiempo y por considerar a Vialoop. Si más adelante retoman la necesidad${service}, quedamos disponibles para apoyarlos.`,
      emailSubject: `Gracias por considerar a Vialoop · ${prospect.company}`,
      emailBody: [
        `${greeting},`,
        "",
        `Gracias por el tiempo y por considerar a Vialoop${service}. Entendemos que hoy el proyecto no continuará, pero quedamos disponibles si las prioridades cambian más adelante.`,
        "",
        "Será un gusto volver a conversar cuando exista una nueva oportunidad en diseño web, sistemas o hosting.",
        "",
        signature,
      ].join("\n"),
    };
  }

  return {
    whatsapp: `${greeting}, soy parte del equipo de Vialoop. Ayudamos a empresas con diseño web, desarrollo de software y hosting. Me gustaría conocer lo que necesitan${service} y evaluar una solución adecuada para ${prospect.company}.`,
    emailSubject: `Conversemos sobre ${prospect.interest.trim() || "tu próximo proyecto"} · Vialoop`,
    emailBody: [
      `${greeting},`,
      "",
      `Soy parte del equipo de Vialoop. Ayudamos a empresas como ${prospect.company} con diseño web, desarrollo de software y hosting.`,
      "",
      `Me gustaría conocer mejor lo que necesitan${service} para recomendar una solución, alcance y próximos pasos adecuados.`,
      "",
      "¿Tienes disponibilidad para una breve conversación esta semana?",
      "",
      signature,
    ].join("\n"),
  };
}
