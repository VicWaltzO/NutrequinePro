import { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import { executeCommand } from "../../lib/domain.mjs";

const [filename, action] = process.argv.slice(2);
let raw;
let connection;
try {
  if (action === "lock") {
    raw = new DatabaseSync(filename);
    raw.exec("BEGIN IMMEDIATE");
    process.send({ ready: true });
  } else {
    connection = openSqliteDatabase(filename, { busyTimeoutMs: 1000 });
    const store = createStore(() => connection);
    const before = await store.loadState();
    process.send({ ready: true, state: before });
    process.on("message", async (message) => {
      if (message.action !== "write") return;
      try {
        const outcome = executeCommand(before, message.command, before.users[0]);
        outcome.state.audit.at(-1).request_id = message.command.request_id;
        await store.persistState(before, outcome.state);
        process.send({ saved: true });
      } catch (error) {
        process.send({ saved: false, error: error.message });
      }
    });
  }
  process.on("message", (message) => {
    if (message.action !== "stop") return;
    if (raw) {
      raw.exec("ROLLBACK");
      raw.close();
    }
    connection?.close();
    process.disconnect();
  });
} catch (error) {
  process.send({ error: error.message });
  process.exitCode = 1;
  process.disconnect();
}
