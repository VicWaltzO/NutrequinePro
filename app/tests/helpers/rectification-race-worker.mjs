import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import { executeCommand } from "../../lib/domain.mjs";
const db = openSqliteDatabase(process.argv[2]);
let store, before, after;
process.on("message", async (m) => {
  try {
    if (m.type === "prepare") {
      store = createStore(() => db, m.options);
      before = await store.loadState();
      after = executeCommand(before, m.command, before.users[0], undefined, m.options).state;
      Object.assign(after.audit.at(-1), { request_id: m.command.request_id, request_contract_version: 1 });
      process.send({ ready: true });
    } else {
      try {
        await store.persistState(before, after);
        process.send({ won: true });
      } catch {
        process.send({ won: false });
      } finally {
        db.close();
        process.disconnect();
      }
    }
  } catch (e) {
    process.send({ error: String(e) });
    db.close();
    process.disconnect();
  }
});
