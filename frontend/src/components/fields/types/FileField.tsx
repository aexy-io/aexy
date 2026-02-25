"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function getFileName(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").pop();
    return path ? decodeURIComponent(path) : url;
  } catch {
    return url;
  }
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isImageUrl(url: string): boolean {
  const ext = getFileExtension(url);
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext);
}

export function FileFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "No file" : "—"}</span>;
  }

  const url = String(value);
  const name = getFileName(url);
  const ext = getFileExtension(name);
  const isImage = isImageUrl(url);

  if (surface === "table_cell") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 truncate max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage ? (
          <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
        <span className="truncate">{name}</span>
        {ext && <span className="text-muted-foreground text-xs uppercase flex-shrink-0">{ext}</span>}
      </a>
    );
  }

  // Detail / highlights view - show thumbnail for images
  return (
    <div className="space-y-2">
      {isImage && (
        <img
          src={url}
          alt={name}
          className="max-h-32 rounded-lg border border-border object-contain"
        />
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {name}
      </a>
    </div>
  );
}

export function FileFieldEdit({ value, onChange, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="url"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder || "File URL..."}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
