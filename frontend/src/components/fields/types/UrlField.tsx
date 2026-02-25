"use client";

import { FieldViewProps, FieldEditProps } from "../types";

export function UrlFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const display = surface === "table_cell"
    ? String(value)
    : String(value).replace(/^https?:\/\//, "");
  return (
    <a
      href={String(value)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 hover:underline text-sm truncate inline-block max-w-[200px] transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {display}
    </a>
  );
}

export function UrlFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="url"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder || "https://..."}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
