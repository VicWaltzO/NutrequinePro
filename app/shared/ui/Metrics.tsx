import React from "react";
export function Metrics({ items }: { items: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <div className="metrics">
      {items.map((x) => (
        <div className="metric" key={x.label}>
          <span>{x.label}</span>
          <strong>{x.value}</strong>
          {x.note && <small>{x.note}</small>}
        </div>
      ))}
    </div>
  );
}
