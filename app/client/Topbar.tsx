import { useState } from "react";
import type { ComponentProps } from "react";
import { ChevronRight, RefreshCw, Menu, Sun, Moon, LogOut } from "lucide-react";
import type LegacyTopbar from "../app/ui/Topbar";
import { day } from "../shared/lib/format";
import { nav } from "../app/ui/navigation";
import { logout } from "./session-api";

export default function Topbar({
  view,
  reload,
  theme,
  menu,
  setMenu,
  toggleTheme,
}: ComponentProps<typeof LegacyTopbar>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signout = async () => {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch {
      setError("No se pudo cerrar la sesión. Vuelva a intentar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <header className="topbar">
      <button
        className="icon-button mobile-menu"
        aria-label="Abrir navegación"
        onClick={() => setMenu(!menu)}
      >
        <Menu size={20} />
      </button>
      <div className="breadcrumb">
        Nutrequine Pro <ChevronRight size={14} />
        <strong>{nav.find((item) => item[0] === view)?.[1]}</strong>
      </div>
      <div className="topbar-right">
        <span>PEN · {day()}</span>
        <button
          className="icon-button"
          aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          className="account-signout"
          title="Salir de la cuenta actual"
          disabled={busy}
          onClick={signout}
        >
          <LogOut size={17} />
          {busy ? "Saliendo…" : "Salir"}
        </button>
        <button
          className="icon-button"
          title="Actualizar datos"
          aria-label="Actualizar datos"
          onClick={reload}
        >
          <RefreshCw size={17} />
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
    </header>
  );
}
