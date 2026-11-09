import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import { executeCommand } from "../../lib/domain.mjs";
const connection = openSqliteDatabase(process.argv[2]);
const store = createStore(() => connection);
const before = await store.loadState();
process.send({ ready: true });
process.once("message", async (command) => {
  try {
    const outcome = executeCommand(before, command, before.users[0]);
    Object.assign(outcome.state.audit.at(-1), {
      request_id: command.request_id,
      request_contract_version: 1,
    });
    await store.persistState(before, outcome.state);
    process.send({ saved: true });
  } catch (error) {
    process.send({ saved: false, error: error.message });
  } finally {
    connection.close();
    process.disconnect();
  }
});
