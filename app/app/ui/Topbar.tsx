"use client";
import { ChevronRight, RefreshCw, Menu, Sun, Moon, LogOut } from "lucide-react";
import { day } from "@/shared/ui";
import type { Dispatch, SetStateAction } from "react";
import { nav } from "./navigation";
export default function Topbar({
  view,
  reload,
  theme,
  menu,
  setMenu,
  toggleTheme,
}: {
  view: string;
  reload: () => Promise<void>;
  theme: "light" | "dark";
  menu: boolean;
  setMenu: Dispatch<SetStateAction<boolean>>;
  toggleTheme: () => void;
}) {
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
        <strong>{nav.find((x) => x[0] === view)?.[1]}</strong>
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
        <a
          className="account-signout"
          href="/signout-with-chatgpt?return_to=%2F"
          target="_top"
          title="Salir de la cuenta actual"
        >
          <LogOut size={17} />
          Salir
        </a>
        <button
          className="icon-button"
          title="Actualizar datos"
          aria-label="Actualizar datos"
          onClick={reload}
        >
          <RefreshCw size={17} />
        </button>
      </div>
    </header>
  );
}
