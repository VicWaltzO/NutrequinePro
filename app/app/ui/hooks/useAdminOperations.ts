"use client";
import { useEffect } from "react";
import { useState } from "react";
import { errorMessage } from "@/lib/domain-types";
import type { AppState } from "@/lib/domain-types";
import type { User } from "@/lib/domain-types";
import type { EditorRecord } from "@/lib/domain-types";
import { createCommandRequest } from "@/lib/command-request.mjs";
import type { Modal } from "@/shared/types/admin";
class StateRequestError extends Error {
  constructor(
    message: string,
    readonly authenticatedId?: string,
  ) {
    super(message);
  }
}
async function fetchState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  const body = (await response.json()) as {
    state: AppState;
    actor: User;
    error?: string;
    authenticated_id?: string;
  };
  if (!response.ok)
    throw new StateRequestError(
      body.error ?? "No se pudieron cargar los datos.",
      response.status === 403 ? body.authenticated_id : undefined,
    );
  return body;
}
export function useAdminOperations() {
  const [authenticatedId, setAuthenticatedId] = useState<string | null>(null);
  const [s, setS] = useState<AppState | null>(null);
  const [actor, setActor] = useState<User | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [requests] = useState(createCommandRequest);
  const reload = async () => {
    try {
      const j = await fetchState();
      setS(j.state);
      setActor(j.actor);
      setError("");
      setAuthenticatedId(null);
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar los datos."));
      setAuthenticatedId(e instanceof StateRequestError ? (e.authenticatedId ?? null) : null);
    }
  };
  useEffect(() => {
    let active = true;
    fetchState()
      .then((j) => {
        if (active) {
          setS(j.state);
          setActor(j.actor);
          setError("");
          setAuthenticatedId(null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e, "No se pudieron cargar los datos."));
          setAuthenticatedId(e instanceof StateRequestError ? (e.authenticatedId ?? null) : null);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const open = (type: string, record?: EditorRecord, kind?: string) => {
    setError("");
    requests.reset();
    setModal({ type, record, kind });
  };
  const close = () => {
    if (!busy) {
      setModal(null);
      setError("");
      requests.reset();
    }
  };
  const run = async (type: string, p: object): Promise<string | true | null> => {
    if (busy) return null;
    const { _keep_open, ...payload } = p as { _keep_open?: boolean };
    const fingerprint = JSON.stringify({ type, payload });
    const requestId = requests.begin(fingerprint);
    if (!requestId) return null;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, payload, request_id: requestId }),
        }),
        j = (await r.json()) as { state: AppState; result: string | null; error?: string };
      if (!r.ok) throw Error(j.error);
      setS(j.state);
      requests.reset();
      setToast("Operación registrada.");
      if (!_keep_open) {
        if (type.startsWith("SALE_") && j.result) setModal({ type: "sale-detail", record: { id: j.result } });
        else if (type.startsWith("PRODUCTION_") && j.result)
          setModal({ type: "production-detail", record: { id: j.result } });
        else if (["PAYMENT_CREATE", "PAYMENT_APPLY_CREDIT"].includes(type) && j.result)
          setModal({ type: "payment-detail", record: { id: j.result } });
        else setModal(null);
      }
      return j.result ?? true;
    } catch (e) {
      setError(errorMessage(e, "No se pudo guardar. Vuelva a intentar."));
      return null;
    } finally {
      requests.finish();
      setBusy(false);
    }
  };
  return { s, actor, modal, error, busy, toast, authenticatedId, reload, open, close, run };
}
