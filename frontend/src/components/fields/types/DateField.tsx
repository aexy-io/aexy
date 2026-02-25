"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function formatDate(value: unknown, includeTime: boolean): string {
  try {
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return String(value);
    if (includeTime) {
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString();
  } catch {
    return String(value);
  }
}

export function DateFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return <span className="text-sm text-foreground">{formatDate(value, false)}</span>;
}

export function DatetimeFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return <span className="text-sm text-foreground">{formatDate(value, true)}</span>;
}

export function DateFieldEdit({ value, onChange, required, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="date"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}

export function DatetimeFieldEdit({ value, onChange, required, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="datetime-local"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
