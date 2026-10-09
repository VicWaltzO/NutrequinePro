"use client";
import Image from "next/image";
import type { User } from "@/lib/domain-types";
import { ChevronRight } from "lucide-react";
import { label } from "@/shared/ui";
import { nav } from "./navigation";
export default function Sidebar({
  actor,
  view,
  go,
  menu,
}: {
  actor: User;
  view: string;
  go: (view: string, tab?: string) => void;
  menu: boolean;
}) {
  return (
    <aside className={"sidebar " + (menu ? "visible" : "")}>
      <a className="brand" href="#dashboard" onClick={() => go("dashboard")}>
        <Image width={150} height={150} unoptimized src="/brand/logo.jpg" alt="Nutrequine Pro" />
        <span>
          NUTREQUINE<span>PRO / ADMINISTRACIÓN</span>
        </span>
      </a>
      <span className="nav-caption">OPERACIÓN DEL NEGOCIO</span>
      <nav>
        {nav.map(([id, title, Icon]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => go(id)}>
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
  );
}
