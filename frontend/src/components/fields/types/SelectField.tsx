"use client";

import { StatusBadge } from "@/components/crm/CRMBadge";
import { FieldViewProps, FieldEditProps } from "../types";

export function SelectFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const option = config.options?.find((o) => o.value === value);
  const colorMap = displayConfig?.colorMap;
  const color = colorMap?.[String(value)] || option?.color || "#6366f1";
  const label = option?.label || String(value);
  const variant = displayConfig?.variant || "pill";

  // Text-only variant
  if (variant === "text_only") {
    return <span className="text-sm text-foreground">{label}</span>;
  }

  // Dot + label variant
  if (variant === "dot_label") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
    );
  }

  // Colored background variant
  if (variant === "colored_bg") {
    return (
      <span
        className="text-xs font-medium px-2 py-1 rounded"
        style={{ backgroundColor: color + "22", color }}
      >
        {label}
      </span>
    );
  }

  // Default: pill (StatusBadge)
  return <StatusBadge label={label} color={color} size="sm" />;
}

export function SelectFieldEdit({ value, config, onChange, required, className }: FieldEditProps) {
  return (
    <select
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    >
      <option value="">Select...</option>
      {(config.options || []).map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
