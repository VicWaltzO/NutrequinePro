"use client";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/domain-types";
import type { AppState, User, EditorRecord } from "@/lib/domain-types";
import { createCommandRequest } from "@/lib/command-request.mjs";
import type { Modal } from "@/shared/types/admin";
import { fetchAdminState, submitAdminCommand, StateRequestError } from "../admin-api";
export function useAdminOperations() {
  const [authenticatedId, setAuthenticatedId] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [actor, setActor] = useState<User | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [requests] = useState(createCommandRequest);
  const reload = async () => {
    try {
      const responseBody = await fetchAdminState();
      setState(responseBody.state);
      setActor(responseBody.actor);
      setError("");
      setAuthenticatedId(null);
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar los datos."));
      setAuthenticatedId(e instanceof StateRequestError ? (e.authenticatedId ?? null) : null);
    }
  };
  useEffect(() => {
    let active = true;
    fetchAdminState()
      .then((responseBody) => {
        if (active) {
          setState(responseBody.state);
          setActor(responseBody.actor);
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
      const toastTimeout = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(toastTimeout);
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
  const run = async (type: string, operationPayload: object): Promise<string | true | null> => {
    if (busy) return null;
    const { _keep_open, ...payload } = operationPayload as { _keep_open?: boolean };
    const fingerprint = JSON.stringify({ type, payload });
    const requestId = requests.begin(fingerprint);
    if (!requestId) return null;
    setBusy(true);
    setError("");
    try {
      const responseBody = await submitAdminCommand(type, payload, requestId);
      setState(responseBody.state);
      requests.reset();
      setToast("Operación registrada.");
      if (!_keep_open) {
        if (type.startsWith("SALE_") && responseBody.result) {
          setModal({ type: "sale-detail", record: { id: responseBody.result } });
        } else if (type.startsWith("PRODUCTION_") && responseBody.result) {
          setModal({ type: "production-detail", record: { id: responseBody.result } });
        } else if (["PAYMENT_CREATE", "PAYMENT_APPLY_CREDIT"].includes(type) && responseBody.result) {
          setModal({ type: "payment-detail", record: { id: responseBody.result } });
        } else {
          setModal(null);
        }
      }
      return responseBody.result ?? true;
    } catch (e) {
      setError(errorMessage(e, "No se pudo guardar. Vuelva a intentar."));
      return null;
    } finally {
      requests.finish();
      setBusy(false);
    }
  };
  return { s: state, actor, modal, error, busy, toast, authenticatedId, reload, open, close, run };
}
