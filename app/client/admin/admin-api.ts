import type { AppState, User } from "@/shared/types/domain";
import { adminFetch } from "../session-api.ts";

export async function fetchAdminState(): Promise<{ state: AppState; actor: User }> {
  const response = await adminFetch("/api/state");
  return response.json();
}

export async function submitAdminCommand(
  type: string,
  payload: object,
  requestId: string,
): Promise<{ state: AppState; result: string | null }> {
  const response = await adminFetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload, request_id: requestId }),
  });
  return response.json();
}
