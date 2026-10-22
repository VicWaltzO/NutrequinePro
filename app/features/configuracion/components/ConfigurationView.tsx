import type { AppState, User, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import Configuration from "@/features/configuracion/components/Configuration";
import type { ReactNode } from "react";
export default function ConfigurationView({
  s: state,
  actor,
  tab,
  open,
  theme,
  tabs,
}: {
  s: AppState;
  actor: User;
  tab: string;
  open: OpenModal;
  theme: "light" | "dark";
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Empresa y valores"],
        ["products", "Productos"],
        ["users", "Usuarios"],
        ["audit", "Auditoría"],
        ["appearance", "Apariencia"],
      ])}
      <SubtabContent tab={tab} order={["all", "products", "users", "audit", "appearance"]}>
        <Configuration s={state} actor={actor} tab={tab} open={open} theme={theme} />
      </SubtabContent>
    </>
  );
}
