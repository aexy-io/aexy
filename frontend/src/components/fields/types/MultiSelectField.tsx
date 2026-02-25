"use client";

import { StatusBadge } from "@/components/crm/CRMBadge";
import { FieldViewProps, FieldEditProps } from "../types";

export function MultiSelectFieldView({ value, config, surface }: FieldViewProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => {
        const option = config.options?.find((o) => o.value === v);
        return (
          <StatusBadge
            key={String(v)}
            label={option?.label || String(v)}
            color={option?.color || "#6366f1"}
            size="sm"
          />
        );
      })}
    </div>
  );
}

export function MultiSelectFieldEdit({ value, config, onChange }: FieldEditProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];

  const toggle = (optValue: string) => {
    if (selected.includes(optValue)) {
      onChange(selected.filter((v) => v !== optValue));
    } else {
      onChange([...selected, optValue]);
    }
  };

  return (
    <div className="space-y-1.5">
      {(config.options || []).map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
          />
          <span className="text-foreground">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
