import { journeyFixture, confirmed, command } from "./journey-fixture.mjs";
import { actor } from "./receipt-fixture.mjs";
import { executeCommand } from "../../lib/domain.mjs";
export { actor, command };
export const apply34 = (s, c, options, user = actor) => {
  const out = executeCommand(s, c, user, "2026-11-14T20:00:00.000Z", options);
  Object.assign(out.state.audit.at(-1), { request_id: c.request_id, request_contract_version: 1 });
  return out;
};
export function rectificationFixture(nuclei = "20") {
  const f = journeyFixture();
  f.s.users.push(
    { ...actor, id: "rect-op", role: "OPERATOR" },
    { ...actor, id: "rect-view", role: "VIEWER" },
  );
  const out = confirmed(f.s, f.options, "ROSADO", nuclei);
  return { ...f, s: out.s, id: out.id };
}
export const rectify = (s, nuclei = "18", extra = {}, id = s.microPreparations[0].id) =>
  command("MICRO_PREPARATION_RECTIFY", {
    preparation_id: id,
    nuclei,
    date: "2026-11-14",
    reason: "Se contaron dos núcleos de más",
    reference: "ACTA SINTÉTICA 34",
    recoverable: true,
    expected_revision: s.revision,
    ...extra,
  });
