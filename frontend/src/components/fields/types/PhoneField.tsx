"use client";

import { FieldViewProps, FieldEditProps } from "../types";

export function PhoneFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return (
    <a
      href={`tel:${value}`}
      className="text-foreground hover:text-blue-400 text-sm transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {String(value)}
    </a>
  );
}

export function PhoneFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="tel"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
