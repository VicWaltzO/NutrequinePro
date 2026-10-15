import { provisionAuthentication } from "./provision.mts";
import type { ProvisionInput } from "./provision.mts";

try {
  const args = process.argv.slice(2);
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (
      !["--database", "--auth-database", "--mode", "--authorize-link"].includes(name) ||
      Object.hasOwn(options, name)
    )
      throw new Error("Opciones inválidas.");
    if (name === "--authorize-link") options[name] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Falta el valor de " + name);
      options[name] = value;
    }
  }
  const businessFile = options["--database"];
  const authFile = options["--auth-database"];
  const mode = options["--mode"];
  if (
    typeof businessFile !== "string" ||
    typeof authFile !== "string" ||
    !["new", "link"].includes(String(mode))
  )
    throw new Error("Seleccione --database, --auth-database y --mode new|link.");
  if (mode === "link" && !options["--authorize-link"])
    throw new Error(
      "Vincular una identidad histórica exige --authorize-link y autorización del responsable local.",
    );
  if (process.stdin.isTTY)
    throw new Error(
      "Suministre un objeto JSON privado mediante stdin; nunca use contraseñas como argumentos.",
    );
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 8192) throw new Error("Entrada demasiado grande.");
    chunks.push(bytes);
  }
  const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Entrada inválida.");
  const result = await provisionAuthentication(
    businessFile,
    authFile,
    mode as "new" | "link",
    input as ProvisionInput,
  );
  console.log(JSON.stringify({ ok: true, ...result }));
} catch {
  console.error(
    "No se provisionaron credenciales. Revise autorización, modo, identidad activa, contraseña, permisos y preparación de bases. El destino debe ser nuevo; conserve intentos parciales para diagnóstico.",
  );
  process.exitCode = 1;
}
