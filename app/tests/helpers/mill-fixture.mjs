import { journeyFixture, confirmed, create, link, actor, command } from "./journey-fixture.mjs";
import { executeCommand } from "../../lib/domain.mjs";
export { actor };
export const apply = (s, c, options, user = actor) => {
  const out = executeCommand(s, c, user, "2026-11-14T04:30:00.000Z", options);
  out.state.audit.at(-1).request_id = c.request_id;
  return out;
};
export function ready(quantities = ["1", "1", "1"]) {
  const f = journeyFixture();
  f.s.users.push({ ...actor, id: "mill-op", name: "Operador sintético", role: "OPERATOR" });
  const rose = confirmed(f.s, f.options, "ROSADO", "10");
  const green = confirmed(rose.s, f.options, "VERDE_AMARILLO", "10");
  f.s = apply(green.s, create(green.s, quantities), f.options).state;
  for (const [i, line] of f.s.productionJourneyLines.entries())
    f.s = apply(f.s, link(f.s, line.id, i ? green.id : rose.id, quantities[i]), f.options).state;
  return f;
}
export function closeCommand(s, bags = 39, index = 0) {
  return command("MILL_CLOSE", {
    line_id: s.productionJourneyLines[index].id,
    date: "2026-11-14",
    actual_bags: bags,
    lot_complete: true,
    formula_consent: false,
    expected_revision: s.revision,
  });
}
