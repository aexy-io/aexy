"use client";

import { ExternalLink } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function UrlFieldView({ value, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "\u2014"}</span>;
  }
  const url = String(value);
  const variant = displayConfig?.variant;

  if (variant === "favicon_link") {
    const domain = getDomain(url);
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-foreground hover:text-blue-400 transition-colors truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span className="truncate">{domain}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
      </a>
    );
  }

  const display = surface === "table_cell"
    ? url
    : url.replace(/^https?:\/\//, "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 hover:underline text-sm truncate inline-block max-w-[200px] transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {display}
    </a>
  );
}

export function UrlFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="url"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder || "https://..."}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
