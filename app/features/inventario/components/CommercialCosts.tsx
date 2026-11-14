import { useRef, useState } from "react";
import type { AppState, Submit } from "@/lib/domain-types";
import { Input, Select, SortableTable, money } from "@/shared/ui";
import { unitLabels } from "@/shared/domain/presentation.mjs";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { commercialCosts, costHistory, costMoney, type CostFlow } from "../domain/commercial-cost.mjs";

export default function CommercialCosts({
  s,
  admin,
  run,
  busy,
}: {
  s: AppState;
  admin: boolean;
  run: Submit;
  busy: boolean;
}) {
  const view = commercialCosts(s);
  const [mode, setMode] = useState("COST_RECOGNIZE");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState("INCREASE");
  const [period, setPeriod] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [revision, setRevision] = useState(s.revision);
  const [requests] = useState(createCommandRequest);
  const frozen = useRef<{ type: string; payload: object } | null>(null);
  const pending = view.flows.filter((f) => f.quantity > 0 && !f.return_of && !f.recognized);
  const groupLabel = (key: string) => {
    const g = view.groups.find((g) => g.key === key);
    return g
      ? `${s.products.find((p) => p.id === g.product_id)?.name} · ${unitLabels(g.presentation).singular} ${(JSON.parse(g.key) as (string | number | null)[])[3] ?? "peso nominal pendiente"} g`
      : key;
  };
  const entryLabel = (f: CostFlow) => {
    const origin =
      f.kind === "OPENING"
        ? "Apertura"
        : (s.productions.find((p) => p.id === f.source_id)?.code ??
          s.sales.find((p) => p.id === f.source_id)?.code ??
          s.returns.find((p) => p.id === f.source_id)?.code ??
          "Ingreso físico");
    return `${origin} · registro ${f.sequence}`;
  };
  const historyLabel: Record<string, string> = {
    START: "Inicio",
    RECOGNIZE: "Costo reconocido",
    SETTLE: "Liquidación",
    ADJUST: "Ajuste prospectivo",
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const type = view.active ? mode : "COST_START";
    const payload = {
      reason,
      expected_revision: revision,
      ...(type === "COST_RECOGNIZE"
        ? { target_id: target, amount, reference }
        : type === "COST_SETTLE"
          ? { reference, period_open: period }
          : type === "COST_ADJUST"
            ? { key: target, amount, reference, direction }
            : {}),
    };
    const value = frozen.current ?? { type, payload };
    const id = requests.begin(JSON.stringify(value));
    if (!id) return;
    frozen.current = value;
    setAttempted(true);
    try {
      if (await run(value.type, value.payload, id)) {
        frozen.current = null;
        requests.reset();
        setAttempted(false);
        setRevision(s.revision + 1);
        setAmount("");
        setReference("");
        setReason("");
        setPeriod(false);
        setTarget("");
      }
    } finally {
      requests.finish();
    }
  };
  return (
    <section className="panel" aria-label="Valoración comercial">
      <h2>Valoración comercial</h2>
      <p>
        El inventario físico permite seguir entregando. Las partidas sin costo reconocido mantienen el costo y
        el margen pendientes. Esta valoración se consulta por separado del balance.
      </p>
      {!view.active ? (
        <p>
          Al iniciar se registra el saldo físico actual como apertura pendiente. Las ventas anteriores
          conservan sus registros y no se recalculan.
        </p>
      ) : (
        <>
          <h3>Existencias por producto y presentación</h3>
          <SortableTable
            heads={["Producto y presentación", "Cantidad", "Valor reconocido", "Promedio por unidad"]}
            rows={view.groups}
            values={[
              (g) => groupLabel(g.key),
              (g) => g.quantity,
              (g) => costMoney(g.value),
              (g) => costMoney(g.average),
            ]}
            tie={(g) => [groupLabel(g.key), g.key]}
          >
            {(g) => (
              <tr key={g.key}>
                <td>{groupLabel(g.key)}</td>
                <td>{g.quantity}</td>
                <td>{g.value === null ? "Pendiente de valoración" : money(costMoney(g.value)!)}</td>
                <td>{g.average === null ? "Pendiente o sin existencias" : money(costMoney(g.average)!)}</td>
              </tr>
            )}
          </SortableTable>
          {!view.groups.length && <p>No hay movimientos comerciales desde el inicio.</p>}
          <h3>Entradas pendientes</h3>
          {pending.length ? (
            <ul>
              {pending.map((f) => (
                <li key={f.id}>
                  {groupLabel(f.key)} · {f.quantity} {unitLabels(f.presentation).plural} · {entryLabel(f)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay entradas pendientes de reconocimiento.</p>
          )}
          <h3>Salidas y retornos pendientes</h3>
          <p>
            {view.flows.filter((f) => !f.recognized && (f.quantity < 0 || f.return_of)).length} movimientos.
            Reconozca las entradas y luego liquide explícitamente los movimientos de períodos abiertos.
          </p>
        </>
      )}
      {admin && (
        <form aria-label="Registrar valoración comercial" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy || attempted}>
            <legend>{view.active ? "Registrar valoración" : "Iniciar registro de valoración"}</legend>
            {view.active && (
              <>
                <Select
                  empty={false}
                  label="Acción económica"
                  value={mode}
                  onChange={(v) => {
                    setMode(v);
                    setTarget("");
                    setRevision(s.revision);
                  }}
                  options={[
                    ["COST_RECOGNIZE", "Reconocer costo de entrada"],
                    ["COST_SETTLE", "Liquidar salidas y retornos pendientes"],
                    ["COST_ADJUST", "Ajustar valor de existencias"],
                  ].map(([id, name]) => ({ id, name }))}
                />
                {mode !== "COST_SETTLE" && (
                  <>
                    <Select
                      label={mode === "COST_RECOGNIZE" ? "Entrada pendiente" : "Existencias a ajustar"}
                      value={target}
                      onChange={(v) => {
                        setTarget(v);
                        setRevision(s.revision);
                      }}
                      empty="Seleccione"
                      options={[
                        ...(mode === "COST_RECOGNIZE"
                          ? pending.map(
                              (f) =>
                                [f.id, `${groupLabel(f.key)} · ${f.quantity} · ${entryLabel(f)}`] as [
                                  string,
                                  string,
                                ],
                            )
                          : view.groups
                              .filter((g) => g.quantity > 0 && !g.pending)
                              .map((g) => [g.key, groupLabel(g.key)] as [string, string])),
                      ].map(([id, name]) => ({ id, name }))}
                      required
                    />
                    <Input
                      label={
                        mode === "COST_RECOGNIZE" ? "Costo total reconocido S/" : "Importe del ajuste S/"
                      }
                      type="number"
                      min={mode === "COST_RECOGNIZE" ? "0" : "0.01"}
                      step="0.01"
                      value={amount}
                      onChange={setAmount}
                      required
                    />
                  </>
                )}
                {mode === "COST_ADJUST" && (
                  <>
                    <Select
                      empty={false}
                      label="Dirección del ajuste"
                      value={direction}
                      onChange={setDirection}
                      options={[
                        ["INCREASE", "Aumentar valor"],
                        ["DECREASE", "Disminuir valor"],
                      ].map(([id, name]) => ({ id, name }))}
                    />
                    <p>
                      El ajuste modifica solo las existencias actuales. Conserva los costos de ventas
                      anteriores.
                    </p>
                  </>
                )}
                <Input label="Referencia documental" value={reference} onChange={setReference} required />
                {mode === "COST_SETTLE" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={period}
                      onChange={(e) => {
                        setPeriod(e.target.checked);
                        setRevision(s.revision);
                      }}
                      required
                    />{" "}
                    Confirmo que todos los movimientos pendientes a liquidar pertenecen a períodos abiertos;
                    no modifico cierres anteriores.
                  </label>
                )}
                {mode === "COST_RECOGNIZE" && (
                  <p>
                    Ingrese el total aprobado para toda la entrada, con sus comprobantes. Un costo desconocido
                    no es cero. La cifra informativa del molino no se reconoce automáticamente.
                  </p>
                )}
              </>
            )}
            <Input
              label="Motivo de valoración"
              value={reason}
              onChange={(v) => {
                setReason(v);
                if (!attempted) setRevision(s.revision);
              }}
              required
            />
          </fieldset>
          {attempted && (
            <p role="status">
              Si perdió la respuesta, reintente la misma solicitud. Para corregir los datos, prepare otro
              intento.
            </p>
          )}
          <div className="detail-actions">
            <button className="primary" disabled={busy} type="submit">
              {attempted
                ? "Reintentar valoración"
                : !view.active
                  ? "Iniciar valoración comercial"
                  : mode === "COST_RECOGNIZE"
                    ? "Reconocer costo"
                    : mode === "COST_SETTLE"
                      ? "Liquidar pendientes"
                      : "Registrar ajuste de valor"}
            </button>
            {attempted && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  frozen.current = null;
                  requests.reset();
                  setAttempted(false);
                  setRevision(s.revision);
                }}
              >
                Preparar otro intento
              </button>
            )}
          </div>
        </form>
      )}
      {view.active && (
        <details>
          <summary>Historial de valoración</summary>
          <ul>
            {costHistory(s)
              .filter((r) => ["RECOGNIZE", "SETTLE", "ADJUST", "START"].includes(r.new_snapshot.kind))
              .map((r) => (
                <li key={r.id}>
                  {r.created_at} · {historyLabel[r.new_snapshot.kind]} ·{" "}
                  {r.new_snapshot.reference ?? "Inicio"} · {r.reason}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
