import type { AppState, User } from "@/lib/domain-types";

export class StateRequestError extends Error {
  readonly authenticatedId?: string;
  constructor(message: string, authenticatedId?: string) {
    super(message);
    this.authenticatedId = authenticatedId;
  }
}
export async function fetchAdminState() {
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

export async function submitAdminCommand(type: string, payload: object, requestId: string) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload, request_id: requestId }),
  });
  const responseBody = (await response.json()) as {
    state: AppState;
    result: string | null;
    error?: string;
  };
  if (!response.ok) throw Error(responseBody.error);

  return responseBody;
}
