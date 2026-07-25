import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(
  scryptCallback,
);

const PASSWORD_PREFIX = "scrypt-v1";
const KEY_LENGTH = 64;

export function validatePasswordStrength(
  password: string,
) {
  if (password.length < 12) {
    return "La contraseña debe tener al menos 12 caracteres.";
  }

  if (!/[a-z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra minúscula.";
  }

  if (!/[A-Z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }

  if (!/\d/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }

  return null;
}

export async function hashPassword(
  password: string,
) {
  const validationError =
    validatePasswordStrength(password);

  if (validationError) {
    throw new Error(validationError);
  }

  const salt = randomBytes(24).toString(
    "base64url",
  );

  const derivedKey =
    (await scryptAsync(
      password,
      salt,
      KEY_LENGTH,
    )) as Buffer;

  return [
    PASSWORD_PREFIX,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedPassword: string,
) {
  try {
    const [
      prefix,
      salt,
      storedKey,
    ] = storedPassword.split("$");

    if (
      prefix !== PASSWORD_PREFIX ||
      !salt ||
      !storedKey
    ) {
      return false;
    }

    const storedKeyBuffer =
      Buffer.from(
        storedKey,
        "base64url",
      );

    const derivedKey =
      (await scryptAsync(
        password,
        salt,
        storedKeyBuffer.length,
      )) as Buffer;

    if (
      derivedKey.length !==
      storedKeyBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      derivedKey,
      storedKeyBuffer,
    );
  } catch {
    return false;
  }
}