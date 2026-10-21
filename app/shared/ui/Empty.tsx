import React from "react";
import { Inbox } from "lucide-react";
export function Empty({
  text = "No hay operaciones registradas.",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Inbox size={24} aria-hidden="true" />
      </span>
      <strong>{text}</strong>
      {action}
    </div>
  );
}
