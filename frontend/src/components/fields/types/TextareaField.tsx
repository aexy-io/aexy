"use client";

import { FieldViewProps, FieldEditProps } from "../types";

export function TextareaFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const text = String(value);
  if (surface === "table_cell" || surface === "kanban_card") {
    const truncated = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
    return <span className="text-sm text-foreground">{truncated}</span>;
  }
  return <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>;
}

export function TextareaFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <textarea
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={3}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none"}
    />
  );
}
