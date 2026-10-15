import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { closeSync, lstatSync, mkdirSync, openSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));

function windowsPermissions(directory, create) {
  const script = `
$ErrorActionPreference = 'Stop'
$path = $env:NUTREQUINE_PRIVATE_DIRECTORY
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($user, 'S-1-5-18', 'S-1-5-32-544')
if ($env:NUTREQUINE_CREATE_DIRECTORY_ACL -eq 'yes') {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in $allowed) {
    $identity = New-Object Security.Principal.SecurityIdentifier($sid)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  [IO.Directory]::SetAccessControl($path, $acl)
}
if ([IO.Directory]::Exists($path)) { $acl = [IO.Directory]::GetAccessControl($path) }
else { $acl = [IO.File]::GetAccessControl($path) }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  $sid = $rule.IdentityReference.Value
  if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowed) { throw 'El directorio concede acceso a otras identidades.' }
}
`;
  execFileSync(
    join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      timeout: 15000,
      env: {
        ...process.env,
        NUTREQUINE_PRIVATE_DIRECTORY: directory,
        NUTREQUINE_CREATE_DIRECTORY_ACL: create ? "yes" : "no",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

export function externalPath(filename) {
  if (typeof filename !== "string" || !isAbsolute(filename))
    throw new Error("Se requiere una ruta absoluta.");
  const canonical = join(realpathSync(dirname(filename)), basename(filename));
  const location = relative(sourceRoot, canonical);
  if (!location || (!location.startsWith(".." + sep) && location !== ".." && !isAbsolute(location)))
    throw new Error("Los datos deben estar fuera del repositorio y del código fuente.");
  return canonical;
}

export function assertPrivateDirectory(directory) {
  if (process.platform === "win32") windowsPermissions(directory, false);
  else if ((statSync(directory).mode & 0o077) !== 0)
    throw new Error("El directorio debe ser privado (permisos 0700).");
}

export function createPrivateDirectory(directory) {
  const path = externalPath(directory);
  mkdirSync(path, { mode: 0o700 });
  if (process.platform === "win32") windowsPermissions(path, true);
  assertPrivateDirectory(path);
  return path;
}

export function selectedFile(filename, { create = false } = {}) {
  const path = externalPath(filename);
  assertPrivateDirectory(dirname(path));
  if (create) closeSync(openSync(path, "wx", 0o600));
  if (!lstatSync(path).isFile()) throw new Error("Seleccione un archivo regular, sin enlaces simbólicos.");
  if (process.platform === "win32") windowsPermissions(path, false);
  if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0)
    throw new Error("El archivo debe ser privado (permisos 0600).");
  return path;
}

export function sqliteUri(filename) {
  const uri = pathToFileURL(filename);
  uri.searchParams.set("mode", "rw");
  return uri.href;
}

export function openAdministration(filename, { write = false, create = false, busyTimeoutMs = 1000 } = {}) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 18)) throw new Error("Se requiere Node.js 24.18 o superior.");
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 2147483647)
    throw new Error("Tiempo de espera SQLite inválido.");
  const path = selectedFile(filename, { create });
  const database = new DatabaseSync(write ? sqliteUri(path) : path, {
    readOnly: !write,
    timeout: busyTimeoutMs,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
  return { database, filename: path };
}

export function transaction(database, callback, write = false) {
  database.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      if (database.isTransaction) database.exec("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Falló también el rollback administrativo.");
    }
    throw error;
  }
}
