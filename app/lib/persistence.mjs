import { TABLES, SQL_NAMES, RELATIONS } from "./state-schema.mjs";
export function writePlan(before, after, guardId = crypto.randomUUID()) {
  const plan = [];
  if (before)
    plan.push({
      sql: "INSERT INTO transaction_guards(id,accepted) SELECT ?, CASE WHEN revision = ? THEN 1 ELSE 0 END FROM settings WHERE id = 'company'",
      args: [guardId, before.revision],
    });
  else
    plan.push({
      sql: "INSERT INTO settings(id,data,revision) VALUES ('company',?,?)",
      args: [JSON.stringify(after.config), after.revision],
    });
  for (const table of TABLES) {
    const previousRows = new Map((before?.[table] ?? []).map((x) => [x.id, JSON.stringify(x)]));
    for (const row of after[table])
      if (previousRows.get(row.id) !== JSON.stringify(row)) {
        const columns = ["id", "data", ...(RELATIONS[table] ?? [])];
        const columnNames = columns.join(",");
        const placeholders = columns.map(() => "?").join(",");
        const updates = columns
          .slice(1)
          .map((column) => `${column}=excluded.${column}`)
          .join(",");
        plan.push({
          sql: `INSERT INTO ${SQL_NAMES[table]} (${columnNames}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
          args: [row.id, JSON.stringify(row), ...(RELATIONS[table] ?? []).map((k) => row[k] ?? null)],
        });
      }
  }
  if (before) {
    plan.push({
      sql: "UPDATE settings SET data = ?, revision = ? WHERE id = 'company'",
      args: [JSON.stringify(after.config), after.revision],
    });
    plan.push({ sql: "DELETE FROM transaction_guards WHERE id = ?", args: [guardId] });
  }
  return plan;
}
