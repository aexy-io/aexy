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
};

function formatCurrency(value: unknown, currencyCode?: string): string {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);
  const symbol = CURRENCY_SYMBOLS[currencyCode || "USD"] || "$";
  return `${symbol}${num.toLocaleString()}`;
}

export function CurrencyFieldView({ value, config, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  return (
    <span className="text-green-400 font-medium text-sm">
      {formatCurrency(value, config.currency_code)}
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
