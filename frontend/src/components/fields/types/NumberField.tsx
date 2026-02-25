"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function abbreviateNumber(num: number): string {
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toString();
}

function formatNumber(num: number, config: FieldViewProps["config"], displayConfig?: FieldViewProps["displayConfig"]): string {
  const precision = config.precision ?? undefined;
  const formatted = precision !== undefined
    ? num.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })
    : num.toLocaleString();

  if (displayConfig?.abbreviate) return abbreviateNumber(num);
  if (displayConfig?.showSign && num > 0) return `+${formatted}`;

  if (config.format === "percent") return `${formatted}%`;
  return formatted;
}

export function NumberFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) {
    return <span className="text-sm text-foreground">{String(value)}</span>;
  }

  const variant = displayConfig?.variant || "plain";

  // Progress bar variant
  if (variant === "progress_bar") {
    const max = typeof config.max === "number" ? config.max : 100;
    const pct = Math.min(100, Math.max(0, (num / max) * 100));
    return (
      <div className="flex items-center gap-2 w-full min-w-[80px]">
        <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{Math.round(pct)}%</span>
      </div>
    );
  }

  // Colored badge variant
  if (variant === "colored_badge") {
    const color = num > 0 ? "text-green-400 bg-green-400/10" : num < 0 ? "text-red-400 bg-red-400/10" : "text-foreground bg-accent";
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${color}`}>
        {formatNumber(num, config, displayConfig)}
      </span>
    );
  }

  // Default plain
  return <span className="text-sm text-foreground tabular-nums">{formatNumber(num, config, displayConfig)}</span>;
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
