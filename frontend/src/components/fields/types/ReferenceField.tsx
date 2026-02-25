"use client";

import { Database, Users } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

export function RecordReferenceFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  // value can be an ID string or an object with display_name
  const display = typeof value === "object" && value !== null && "display_name" in value
    ? String((value as { display_name: string }).display_name)
    : String(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm text-purple-400">
      <Database className="h-3 w-3" />
      {display}
    </span>
  );
}

export function UserReferenceFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const display = typeof value === "object" && value !== null && "name" in value
    ? String((value as { name: string }).name)
    : String(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm text-foreground">
      <Users className="h-3 w-3 text-muted-foreground" />
      {display}
    </span>
  );
}

// Reference fields use a text input as placeholder — proper picker is a future enhancement
export function ReferenceFieldEdit({ value, onChange, placeholder, className }: FieldEditProps) {
  return (
    <input
      type="text"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Enter ID..."}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
