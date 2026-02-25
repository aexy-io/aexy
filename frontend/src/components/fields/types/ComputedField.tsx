"use client";

import { Sparkles, Calculator } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

export function FormulaFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-foreground">
      <Calculator className="h-3 w-3 text-muted-foreground" />
      {String(value)}
    </span>
  );
}

export function RollupFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return <span className="text-sm text-foreground tabular-nums">{String(value)}</span>;
}

export function AiComputedFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-purple-400">
      <Sparkles className="h-3 w-3" />
      {String(value)}
    </span>
  );
}

// Computed fields are read-only
export function ComputedFieldEdit({ value }: FieldEditProps) {
  return (
    <span className="text-sm text-muted-foreground italic px-3 py-1.5 block">
      {value !== null && value !== undefined ? String(value) : "Auto-computed"}
    </span>
  );
}
