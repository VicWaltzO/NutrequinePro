"use client";
import type { AppState } from "@/lib/domain-types";
import { Search } from "lucide-react";
import { Input } from "@/shared/ui";
import { Select } from "@/shared/ui";
import type { Dispatch } from "react";
import type { SetStateAction } from "react";
export default function RecordFilters({
  s,
  view,
  q,
  setQ,
  filter,
  setFilter,
  client,
  setClient,
  site,
  setSite,
  from,
  setFrom,
  to,
  setTo,
}: {
  s: AppState;
  view: string;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  filter: string;
  setFilter: Dispatch<SetStateAction<string>>;
  client: string;
  setClient: Dispatch<SetStateAction<string>>;
  site: string;
  setSite: Dispatch<SetStateAction<string>>;
  from: string;
  setFrom: Dispatch<SetStateAction<string>>;
  to: string;
  setTo: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="filters">
      <div className="search">
        <Search size={17} />
        <input
          aria-label="Buscar registros"
          placeholder="Buscar nombre, código o referencia…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Input label="Desde" type="date" value={from} onChange={setFrom} />
      <Input label="Hasta" type="date" value={to} onChange={setTo} />
      {["sales", "collections"].includes(view) && (
        <>
          <Select label="Cliente" value={client} onChange={setClient} options={s.customers} empty="Todos" />
          <Select label="Sede" value={site} onChange={setSite} options={s.sites} empty="Todas" />
        </>
      )}
      {["sales", "collections", "productions"].includes(view) && (
        <Select
          label="Estado"
          value={filter}
          onChange={setFilter}
          empty="Todos"
          options={
            view === "productions"
              ? ["DRAFT", "CONFIRMED", "CLOSED", "CANCELLED"]
              : view === "collections"
                ? ["PENDING", "PARTIAL"]
                : ["DRAFT", "CONFIRMED", "RECTIFIED", "PENDING", "PARTIAL", "PAID", "DELIVERED", "CANCELLED"]
          }
        />
      )}
      <button
        className="text-button"
        onClick={() => {
          setQ("");
          setFrom("");
          setTo("");
          setClient("");
          setSite("");
          setFilter("");
        }}
      >
        Limpiar
      </button>
    </div>
  );
}
