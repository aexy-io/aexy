"use client";

import { FieldViewProps, FieldEditProps } from "../types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  JPY: "\u00A5",
  INR: "\u20B9",
  CAD: "CA$",
  AUD: "A$",
  CHF: "CHF",
  CNY: "\u00A5",
  SGD: "S$",
};

function abbreviateNumber(num: number): string {
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toFixed(0);
}

function formatCurrency(value: unknown, config: FieldViewProps["config"], displayConfig?: FieldViewProps["displayConfig"]): string {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);
  const symbol = CURRENCY_SYMBOLS[config.currency_code || "USD"] || "$";
  const precision = config.precision ?? 0;

  if (displayConfig?.abbreviate) {
    return `${symbol}${abbreviateNumber(num)}`;
  }

  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  return `${symbol}${formatted}`;
}

export function CurrencyFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }

  const variant = displayConfig?.variant || "plain";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  const formatted = formatCurrency(value, config, displayConfig);

  // Colored variant: green for positive, red for negative
  if (variant === "colored" && !isNaN(num)) {
    const color = num > 0 ? "text-green-400" : num < 0 ? "text-red-400" : "text-foreground";
    return (
      <span className={`${color} font-medium text-sm tabular-nums`}>
        {displayConfig?.showSign && num > 0 ? "+" : ""}{formatted}
      </span>
    );
  }

  // Abbreviated variant
  if (variant === "abbreviated") {
    return (
      <span className="text-green-400 font-medium text-sm tabular-nums">
        {formatCurrency(value, config, { ...displayConfig, abbreviate: true })}
      </span>
    );
  }

  // Default: plain green
  return (
    <span className="text-green-400 font-medium text-sm tabular-nums">
      {formatted}
    </span>
  );
}

export function CurrencyFieldEdit({ value, onChange, config, required, placeholder, autoFocus, className }: FieldEditProps) {
  const symbol = CURRENCY_SYMBOLS[config.currency_code || "USD"] || "$";
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
      <input
        type="number"
        value={value !== null && value !== undefined && value !== "" ? (value as number) : ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className || "w-full pl-7 pr-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
      />
    </div>
  );
}
