"use client";

import { Check, X } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

export function CheckboxFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  if (surface === "table_cell") {
    return value ? (
      <Check className="h-4 w-4 text-green-400" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground" />
    );
  }
  // detail_view, highlights, kanban_card
  return <span className={value ? "text-green-400 text-sm" : "text-muted-foreground text-sm"}>{value ? "Yes" : "No"}</span>;
}

export function CheckboxFieldEdit({ value, onChange }: FieldEditProps) {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
    />
  );
}
