"use client";

import { Check, X } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

export function CheckboxFieldView({ value, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }

  const variant = displayConfig?.variant || (surface === "table_cell" ? "check_icon" : "yes_no");

  // Toggle variant
  if (variant === "toggle") {
    return (
      <div className={`w-8 h-4.5 rounded-full relative transition-colors ${value ? "bg-green-500" : "bg-accent"}`}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    );
  }

  // Colored dot variant
  if (variant === "colored_dot") {
    return (
      <span className={`w-3 h-3 rounded-full ${value ? "bg-green-400" : "bg-muted-foreground/30"}`} />
    );
  }

  // Yes/No text variant
  if (variant === "yes_no") {
    return <span className={value ? "text-green-400 text-sm" : "text-muted-foreground text-sm"}>{value ? "Yes" : "No"}</span>;
  }

  // Default: check_icon
  return value ? (
    <Check className="h-4 w-4 text-green-400" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground" />
  );
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
