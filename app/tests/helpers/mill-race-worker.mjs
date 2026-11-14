import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import { writePlan } from "../../lib/persistence.mjs";
import { executeCommand } from "../../lib/domain.mjs";
const db = openSqliteDatabase(process.argv[2]);
process.on("message", async (message) => {
  if (message.type === "prepare") {
    const store = createStore(() => db);
    const before = await store.loadState();
    const actor = before.users[0];
    const after = executeCommand(before, message.command, actor).state;
    Object.assign(after.audit.at(-1), {
      request_id: message.command.request_id,
      request_contract_version: 1,
    });
    globalThis.plan = writePlan(before, after);
    process.send({ ready: true });
  } else if (message.type === "commit") {
    try {
      await db.batch(globalThis.plan.map((q) => db.prepare(q.sql).bind(...q.args)));
      process.send({ won: true });
    } catch {
      process.send({ won: false });
    } finally {
      db.close();
      process.disconnect();
    }
  }
});
