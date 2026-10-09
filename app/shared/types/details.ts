import type { AppState } from "@/lib/domain-types";
import type { User } from "@/lib/domain-types";
import type { OpenModal } from "@/lib/domain-types";
import type { Submit } from "@/lib/domain-types";
export interface DetailProps {
  s: AppState;
  actor: User;
  id: string;
  open: OpenModal;
  run: Submit;
}
