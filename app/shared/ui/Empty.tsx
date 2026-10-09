"use client";
import React from "react";
export function Empty({
  text = "No hay operaciones registradas.",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">＋</span>
      <strong>{text}</strong>
      {action}
    </div>
  );
}
