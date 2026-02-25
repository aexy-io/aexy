"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMs < 0) {
    // Future
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return "today";
    if (absDays === 1) return "tomorrow";
    if (absDays < 7) return `in ${absDays} days`;
    if (absDays < 30) return `in ${Math.ceil(absDays / 7)} weeks`;
    const absMonths = Math.ceil(absDays / 30);
    if (absMonths < 12) return `in ${absMonths} months`;
    const absYears = Math.floor(absDays / 365);
    return absYears === 1 ? "in 1 year" : `in ${absYears} years`;
  }

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatDate(value: unknown, includeTime: boolean, variant?: string): string {
  try {
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return String(value);

    if (variant === "relative") return getRelativeTime(date);

    if (variant === "short") {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    if (variant === "full" || includeTime) {
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
    }

    // Default: absolute
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

export function DateFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }

  const variant = displayConfig?.variant || displayConfig?.dateFormat || config.date_format;
  // Default to relative for table_cell and highlights, absolute for detail
  const effectiveVariant = variant || (surface === "table_cell" || surface === "highlights" ? "relative" : "absolute");

  const formatted = formatDate(value, false, effectiveVariant);

  if (effectiveVariant === "relative") {
    // Show relative with absolute as tooltip
    const absoluteDate = formatDate(value, false, "full");
    return (
      <span className="text-sm text-muted-foreground" title={absoluteDate}>
        {formatted}
      </span>
    );
  }

  return <span className="text-sm text-foreground">{formatted}</span>;
}

export function DatetimeFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }

  const variant = displayConfig?.variant || displayConfig?.dateFormat || config.date_format;
  const effectiveVariant = variant || (surface === "table_cell" ? "relative" : "full");

  if (effectiveVariant === "relative") {
    const date = new Date(String(value));
    if (!isNaN(date.getTime())) {
      const absoluteDate = formatDate(value, true, "full");
      return (
        <span className="text-sm text-muted-foreground" title={absoluteDate}>
          {getRelativeTime(date)}
        </span>
      );
    }
  }

  return <span className="text-sm text-foreground">{formatDate(value, true, effectiveVariant)}</span>;
}

export function DateFieldEdit({ value, onChange, required, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="date"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}

export function DatetimeFieldEdit({ value, onChange, required, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="datetime-local"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
