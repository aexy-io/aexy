"use client";

import { FieldViewProps, FieldEditProps } from "../types";

export function NumberFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) {
    return <span className="text-sm text-foreground">{String(value)}</span>;
  }
  return <span className="text-sm text-foreground tabular-nums">{num.toLocaleString()}</span>;
}

export function NumberFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="number"
      value={value !== null && value !== undefined && value !== "" ? (value as number) : ""}
      onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
