"use client";

import { Phone } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export function PhoneFieldView({ value, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "\u2014"}</span>;
  }
  const phone = String(value);
  const variant = displayConfig?.variant;

  if (variant === "formatted") {
    return (
      <a
        href={`tel:${phone}`}
        className="flex items-center gap-1.5 text-sm text-foreground hover:text-blue-400 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="tabular-nums">{formatPhoneNumber(phone)}</span>
      </a>
    );
  }

  return (
    <a
      href={`tel:${phone}`}
      className="text-foreground hover:text-blue-400 text-sm transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {phone}
    </a>
  );
}

export function PhoneFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="tel"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
