import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const csrfToken = (session: string) => tokenHash("nutrequine-csrf:" + session);

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 15 || Buffer.byteLength(password) > 1024)
    throw new Error("La contraseña debe tener al menos 15 caracteres y como máximo 1024 bytes.");
}

export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return { salt, hash: hash.toString("hex"), algorithm: "scrypt-N131072-r8-p1" };
}

export async function checkPassword(password: string, salt: string, hash: string) {
  const actual = await derive(password, salt);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function loginName(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{3,80}$/.test(value))
    throw new Error(
      "El nombre de acceso debe tener entre 3 y 80 letras ASCII, números, puntos, guiones o guiones bajos.",
    );
  return value.toLowerCase();
}
