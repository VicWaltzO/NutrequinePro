import type { User } from "@/lib/domain-types";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ChevronRight, X } from "lucide-react";
import { label } from "@/shared/ui";
import { nav } from "./navigation";
import { frontendPath } from "../paths";

const subscribeMobile = (listener: () => void) => {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const readMobile = () => window.matchMedia("(max-width: 760px)").matches;

export default function Sidebar({
  actor,
  view,
  go,
  menu,
  closeMenu,
}: {
  actor: User;
  view: string;
  go: (view: string, tab?: string) => void;
  menu: boolean;
  closeMenu: () => void;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  useEffect(() => {
    if (!menu || !mobile) return;
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    const workspace = document.querySelector<HTMLElement>(".workspace");
    const wasInert = workspace?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (workspace) workspace.inert = true;
    const element = sidebar.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      if (event.key !== "Tab") return;
      const elements = element?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      const first = elements?.[0];
      const last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") touch.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerCancel = () => {
      touch.current = null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = touch.current;
      touch.current = null;
      if (start && start.x - event.clientX > 70 && Math.abs(start.y - event.clientY) < 45) closeMenu();
    };
    element?.addEventListener("keydown", onKeyDown);
    element?.addEventListener("pointerdown", onPointerDown);
    element?.addEventListener("pointercancel", onPointerCancel);
    element?.addEventListener("pointerup", onPointerUp);
    const focusFrame = window.requestAnimationFrame(() => {
      element?.querySelector<HTMLButtonElement>(".drawer-close")?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      if (workspace) workspace.inert = wasInert;
      element?.removeEventListener("keydown", onKeyDown);
      element?.removeEventListener("pointerdown", onPointerDown);
      element?.removeEventListener("pointercancel", onPointerCancel);
      element?.removeEventListener("pointerup", onPointerUp);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [menu, mobile, closeMenu]);
  return (
    <>
      {menu && mobile && (
        <button className="navigation-backdrop" aria-label="Cerrar menú de navegación" onClick={closeMenu} />
      )}
      <aside
        ref={sidebar}
        id="primary-navigation"
        className={"sidebar " + (menu ? "visible" : "")}
        inert={mobile && !menu}
        role={mobile && menu ? "dialog" : undefined}
        aria-modal={mobile && menu ? true : undefined}
        aria-label="Navegación principal"
      >
        <button className="icon-button drawer-close" aria-label="Cerrar navegación" onClick={closeMenu}>
          <X size={20} />
        </button>
        <a className="brand" href="#dashboard" onClick={() => go("dashboard")}>
          <img width={150} height={150} src={frontendPath("/brand/logo.jpg")} alt="Nutrequine Pro" />
          <span>
            Nutrequine <b>Pro</b>
            <span>Gestión empresarial</span>
          </span>
        </a>
        <span className="nav-caption">Espacio de trabajo</span>
        <nav aria-label="Secciones de la aplicación">
          {nav.map(([id, title, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {title}
              {view === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{actor.name?.slice(0, 1)?.toUpperCase()}</span>
          <div>
            <strong>{actor.name}</strong>
            <small>{label(actor.role)}</small>
          </div>
        </div>
      </aside>
    </>
  );
}
