import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE_NAME =
  "vialoop_portal_session";

export const SESSION_DURATION_SECONDS =
  60 * 60 * 8;

export type SessionRole =
  | "ADMIN"
  | "COLLABORATOR";

export type SessionPayload = {
  userId: string;
  role: SessionRole;
  issuedAt: number;
  expiresAt: number;
};

function getAuthSecret() {
  const secret =
    process.env.AUTH_SECRET;

  if (
    !secret ||
    Buffer.byteLength(
      secret,
      "utf8",
    ) < 32
  ) {
    throw new Error(
      "AUTH_SECRET no está configurado o tiene menos de 32 caracteres.",
    );
  }

  return secret;
}

function signPayload(
  encodedPayload: string,
) {
  return createHmac(
    "sha256",
    getAuthSecret(),
  )
    .update(encodedPayload)
    .digest("base64url");
}

export function createSessionToken({
  userId,
  role,
}: {
  userId: string;
  role: SessionRole;
}) {
  const issuedAt = Math.floor(
    Date.now() / 1000,
  );

  const expiresAt =
    issuedAt +
    SESSION_DURATION_SECONDS;

  const payload: SessionPayload = {
    userId,
    role,
    issuedAt,
    expiresAt,
  };

  const encodedPayload =
    Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");

  const signature =
    signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifySessionToken(
  token:
    | string
    | null
    | undefined,
): SessionPayload | null {
  try {
    if (!token) {
      return null;
    }

    const tokenParts =
      token.split(".");

    if (tokenParts.length !== 2) {
      return null;
    }

    const [
      encodedPayload,
      providedSignature,
    ] = tokenParts;

    if (
      !encodedPayload ||
      !providedSignature
    ) {
      return null;
    }

    const expectedSignature =
      signPayload(encodedPayload);

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "base64url",
      );

    const providedBuffer =
      Buffer.from(
        providedSignature,
        "base64url",
      );

    if (
      expectedBuffer.length !==
      providedBuffer.length
    ) {
      return null;
    }

    if (
      !timingSafeEqual(
        expectedBuffer,
        providedBuffer,
      )
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url",
      ).toString("utf8"),
    ) as Partial<SessionPayload>;

    const currentTime = Math.floor(
      Date.now() / 1000,
    );

    if (
      typeof payload.userId !==
        "string" ||
      !payload.userId ||
      (
        payload.role !== "ADMIN" &&
        payload.role !==
          "COLLABORATOR"
      ) ||
      typeof payload.issuedAt !==
        "number" ||
      typeof payload.expiresAt !==
        "number" ||
      payload.expiresAt <=
        currentTime
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}