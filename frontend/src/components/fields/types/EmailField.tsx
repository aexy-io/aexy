"use client";

import { FieldViewProps, FieldEditProps } from "../types";

export function EmailFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return (
    <a
      href={`mailto:${value}`}
      className="text-blue-400 hover:text-blue-300 hover:underline text-sm transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {String(value)}
    </a>
  );
}

export function EmailFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="email"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
