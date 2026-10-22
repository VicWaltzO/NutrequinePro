import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../lib/application-store.mjs";
import { memoryPersistence } from "../tests/helpers/memory-persistence.mjs";
import { scenarioSession, adminIdentity } from "../tests/helpers/regression-scenarios.mjs";
import { documentScenario } from "../tests/helpers/document-scenario.mjs";
import { documentModel, renderReport } from "../server/reports.mts";

const database = memoryPersistence();
try {
  const store = createStore(() => database.binding);
  await store.ensureState(adminIdentity);
  const session = scenarioSession(store);
  const ids = await documentScenario(session);
  const state = await session.state();
  const directory = fileURLToPath(new URL("../docs/documentos/ejemplos/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  for (const [kind, id] of [
    ["production", ids.planned],
    ["sale", ids.secondSale],
    ["customer", ids.customer],
    ["balance", "2026-10"],
  ]) {
    const model = documentModel(
      state,
      kind,
      id,
      kind === "customer" ? { from: "2026-10-01", to: "2026-10-31" } : {},
      "2026-10-22T17:00:00Z",
    );
    const target = join(directory, model.filename);
    writeFileSync(target, await renderReport(model));
    console.log(target);
  }
  if (process.argv.includes("--stress")) {
    const stressDirectory = fileURLToPath(new URL("../outputs/report-stress/", import.meta.url));
    mkdirSync(stressDirectory, { recursive: true });
    const report = documentModel(state, "customer", ids.customer, {}, "2026-10-22T17:00:00Z");
    report.sales = Array.from({ length: 130 }, (_, index) => ({
      ...report.sales[0],
      code: `SINTETICA-${String(index + 1).padStart(3, "0")}`,
    }));
    report.customer.notes =
      "Observación de nutrición y planificación. ".repeat(180) + "W".repeat(900) + " FIN-NOTAS";
    writeFileSync(join(stressDirectory, "historial-extenso.pdf"), await renderReport(report));
    const sale = documentModel(state, "sale", ids.secondSale, {}, "2026-10-22T17:00:00Z");
    sale.items = [
      { ...sale.items[0], name: "Nombre muy largo con acentos Álvarez. ".repeat(170) + " FIN-PRODUCTO" },
    ];
    sale.notes = "W".repeat(1000) + " FIN-VENTA";
    writeFileSync(join(stressDirectory, "venta-texto-extremo.pdf"), await renderReport(sale));
  }
} finally {
  database.close();
}
