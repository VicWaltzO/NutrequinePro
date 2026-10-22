import { applyCompanyCatalog, saveCatalogPreview } from "../lib/sqlite/company-catalog.mjs";

try {
  const [command, ...args] = process.argv.slice(2);
  const definitions = { preview: ["database", "actor", "plan"], apply: ["database", "plan", "backup"] };
  if (!Object.hasOwn(definitions, command))
    throw new Error(
      "Uso: company-catalog.mjs preview --database RUTA --actor ID_ADMIN --plan RUTA_NUEVA | apply --database RUTA --plan RUTA --backup RUTA_NUEVA",
    );
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].slice(2);
    const value = args[index + 1];
    if (
      !args[index].startsWith("--") ||
      !definitions[command].includes(key) ||
      Object.hasOwn(options, key) ||
      !value ||
      value.startsWith("--")
    )
      throw new Error("Opción desconocida, repetida o sin valor: " + args[index]);
    options[key] = value;
  }
  for (const key of definitions[command]) if (!options[key]) throw new Error("Falta --" + key);
  const result =
    command === "preview"
      ? saveCatalogPreview(options.database, options.actor, options.plan)
      : await applyCompanyCatalog(options.database, options.plan, options.backup);
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
}
