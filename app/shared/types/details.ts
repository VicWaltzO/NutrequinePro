import type { AppState, User, OpenModal, Submit } from "@/lib/domain-types";

export interface DetailProps {
  s: AppState;
  actor: User;
  id: string;
  open: OpenModal;
  run: Submit;
}
