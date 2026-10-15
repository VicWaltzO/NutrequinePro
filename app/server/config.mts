import { readFileSync } from "node:fs";
import { selectedFile } from "../lib/sqlite/files.mjs";

export interface ServerConfig {
  database: string;
  auth_database: string;
  port: number;
  frontend_directory?: string;
  tls_certificate?: string;
  tls_key?: string;
}

export function validateConfig(input: unknown, allowEphemeralPort = false): ServerConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuración inválida.");
  const value = input as Record<string, unknown>;
  const allowed = new Set([
    "database",
    "auth_database",
    "port",
    "tls_certificate",
    "tls_key",
    "frontend_directory",
  ]);
  if (
    value.frontend_directory !== undefined &&
    (typeof value.frontend_directory !== "string" || !value.frontend_directory.trim())
  )
    throw new Error("Directorio público inválido.");
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error("Opción de configuración desconocida.");
  if (
    typeof value.database !== "string" ||
    typeof value.auth_database !== "string" ||
    !Number.isInteger(value.port) ||
    Number(value.port) < (allowEphemeralPort ? 0 : 1) ||
    Number(value.port) > 65535
  )
    throw new Error("Seleccione ambas bases y un puerto válido explícitamente.");
  if ((value.tls_certificate !== undefined) !== (value.tls_key !== undefined))
    throw new Error("TLS requiere certificado y clave.");
  for (const key of ["tls_certificate", "tls_key"])
    if (value[key] !== undefined && (typeof value[key] !== "string" || !value[key]))
      throw new Error("Ruta TLS inválida.");
  return value as unknown as ServerConfig;
}

export function readConfig(filename: string) {
  return validateConfig(JSON.parse(readFileSync(selectedFile(filename), "utf8")));
}
