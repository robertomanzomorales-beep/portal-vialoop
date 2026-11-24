export type HostingAccessMetadata = {
  panelUrl: string;
  username: string;
  accountReference: string;
  recoveryEmail: string;
  credentialReference: string;
  notes: string;
  updatedAt: string;
  updatedBy: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseHostingAccessMetadata(
  value: unknown,
): HostingAccessMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    panelUrl: stringValue(value.panelUrl),
    username: stringValue(value.username),
    accountReference: stringValue(value.accountReference),
    recoveryEmail: stringValue(value.recoveryEmail),
    credentialReference: stringValue(value.credentialReference),
    notes: stringValue(value.notes),
    updatedAt: stringValue(value.updatedAt),
    updatedBy: stringValue(value.updatedBy),
  };
}

export function hasHostingAccessData(
  value: Pick<
    HostingAccessMetadata,
    | "panelUrl"
    | "username"
    | "accountReference"
    | "recoveryEmail"
    | "credentialReference"
    | "notes"
  >,
) {
  return Object.values(value).some(Boolean);
}
