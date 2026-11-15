import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rectificationFixture, rectify, actor } from "./helpers/rectification-fixture.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
for (const sameRequest of [true, false])
  test(
    `NQP34 dos procesos con request_id ${sameRequest ? "igual" : "distinto"}: CAS un ganador, replay sin duplicados`,
    { timeout: 120000 },
    async (t) => {
      const f = rectificationFixture(),
        dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp34-race-")), "private")),
        file = join(dir, "synthetic.sqlite");
      initializeDatabase(file);
      const db = openSqliteDatabase(file);
      t.after(() => db.close());
      const store = createStore(() => db, f.options);
      await store.persistState(null, f.s);
      const c = rectify(f.s),
        commands = [c, sameRequest ? c : rectify(f.s)];
      const children = commands.map(() =>
        fork(new URL("./helpers/rectification-race-worker.mjs", import.meta.url), [file], {
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        }),
      );
      t.after(() => children.forEach((child) => child.kill()));
      let messages = children.map((child) => once(child, "message"));
      children.forEach((child, i) =>
        child.send({ type: "prepare", command: commands[i], options: f.options }),
      );
      for (const [m] of await Promise.all(messages)) assert.equal(m.ready, true, JSON.stringify(m));
      messages = children.map((child) => once(child, "message"));
      children.forEach((child) => child.send({ type: "commit" }));
      const result = await Promise.all(messages);
      assert.equal(result.filter(([m]) => m.won).length, 1);
      const winningCommand = commands[result.findIndex(([m]) => m.won)],
        s = await store.loadState();
      assert.equal(s.corrections.filter((r) => r.entity_type === "MICRO_PREPARATION_RECTIFY").length, 1);
      assert.equal(s.microLedgers[0].ledger.events.length, 2);
      assert.deepEqual((await store.runCommand(winningCommand, { userId: actor.id })).state, s);
    },
  );
