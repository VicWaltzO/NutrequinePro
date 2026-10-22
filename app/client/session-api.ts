import type { User } from "../shared/types/domain";
import { frontendPath } from "./paths.ts";

export interface LocalSession {
  actor: User;
  csrf_token: string;
  expires_at: string;
}
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
let csrf = "";
const listeners = new Set<(message: string, discard: boolean) => void>();
export function onSessionRequired(listener: (message: string, discard: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function requireSession(message: string, discard = false) {
  csrf = "";
  for (const listener of listeners) listener(message, discard);
}
const messages: Record<number, string> = {
  400: "La solicitud no es válida.",
  401: "La sesión terminó. Inicie sesión para continuar.",
  403: "No dispone de permisos para esta operación.",
  413: "La operación excede el tamaño permitido.",
  415: "El formato de la solicitud no es válido.",
  422: "Revise los datos de la operación.",
  429: "Demasiados intentos. Espere antes de volver a intentar.",
  503: "El servicio no está disponible. Conserve el formulario y vuelva a intentar.",
};

async function send(path: string, init: RequestInit = {}) {
  try {
    return await fetch(frontendPath(path), { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(503, messages[503]);
  }
}
async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return new ApiError(
    response.status,
    typeof body?.error === "string"
      ? body.error
      : (messages[response.status] ?? "No se pudo completar la solicitud."),
  );
}
async function sessionResponse(response: Response): Promise<LocalSession> {
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as LocalSession;
  if (!body.actor?.id || !/^[a-f0-9]{64}$/.test(body.csrf_token))
    throw new ApiError(503, "Respuesta de sesión inválida.");
  csrf = body.csrf_token;
  return body;
}
export const recoverSession = () => send("/api/auth/session").then(sessionResponse);
export const login = (name: string, password: string) =>
  send("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password }),
  }).then(sessionResponse);
export async function logout() {
  const response = await send("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: "{}",
  });
  if (!response.ok && response.status !== 401) throw await responseError(response);
  requireSession("Sesión cerrada.", true);
}

/** Commercial HTTP transport: browser cookies, in-memory CSRF and no automatic command retries. */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const documentRead =
    typeof input === "string" &&
    /^\/api\/documents\/(production|sale|customer|balance)\/[^/?#]+\.pdf(?:\?[^#]*)?$/.test(input) &&
    (!init.method || init.method === "GET");
  if (typeof input !== "string" || (!documentRead && !["/api/state", "/api/command"].includes(input)))
    throw new ApiError(400, "Ruta comercial inválida.");
  const headers = new Headers(init.headers);
  if (init.method === "POST") headers.set("X-CSRF-Token", csrf);
  const response = await send(input, { ...init, headers });
  if (response.ok) return response;
  const error = await responseError(response);
  if (response.status === 401) requireSession(messages[401]);
  else if (response.status === 403) {
    // A denied command can be a valid session with insufficient permissions. Never retry the command.
    const session = await send("/api/auth/session");
    if ([401, 403].includes(session.status)) requireSession("Su acceso cambió. Inicie sesión nuevamente.");
    else if (session.ok) {
      const current = (await session.json()) as LocalSession;
      if (current.csrf_token !== csrf)
        requireSession("La sesión cambió en otra ventana. Inicie sesión nuevamente.");
    }
  }
  throw error;
}
