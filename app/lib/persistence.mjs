import { TABLES, SQL_NAMES, RELATIONS } from "./state-schema.mjs";
export function writePlan(before, after, guard = crypto.randomUUID()) {
  const plan = [];
  if (before)
    plan.push({
      sql: "INSERT INTO transaction_guards(id,accepted) SELECT ?, CASE WHEN revision = ? THEN 1 ELSE 0 END FROM settings WHERE id = 'company'",
      args: [guard, before.revision],
    });
  else
    plan.push({
      sql: "INSERT INTO settings(id,data,revision) VALUES ('company',?,?)",
      args: [JSON.stringify(after.config), after.revision],
    });
  for (const t of TABLES) {
    const previous = new Map((before?.[t] ?? []).map((x) => [x.id, JSON.stringify(x)]));
    for (const row of after[t])
      if (previous.get(row.id) !== JSON.stringify(row)) {
        const keys = ["id", "data", ...(RELATIONS[t] ?? [])];
        plan.push({
          sql: `INSERT INTO ${SQL_NAMES[t]} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
            .slice(1)
            .map((k) => `${k}=excluded.${k}`)
            .join(",")}`,
          args: [row.id, JSON.stringify(row), ...(RELATIONS[t] ?? []).map((k) => row[k] ?? null)],
        });
      }
  }
  if (before) {
    plan.push({
      sql: "UPDATE settings SET data = ?, revision = ? WHERE id = 'company'",
      args: [JSON.stringify(after.config), after.revision],
    });
    plan.push({ sql: "DELETE FROM transaction_guards WHERE id = ?", args: [guard] });
  }
  return plan;
}
