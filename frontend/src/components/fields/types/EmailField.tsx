"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function getInitials(email: string): string {
  const local = email.split("@")[0];
  return local.slice(0, 2).toUpperCase();
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ["#a855f7", "#3b82f6", "#22c55e", "#ef4444", "#f97316", "#ec4899", "#06b6d4"];
  return colors[Math.abs(hash) % colors.length];
}

export function EmailFieldView({ value, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "\u2014"}</span>;
  }
  const email = String(value);
  const variant = displayConfig?.variant;

  if (variant === "avatar_chip") {
    const color = hashColor(email);
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
          style={{ backgroundColor: color }}
        >
          {getInitials(email)}
        </div>
        <a
          href={`mailto:${email}`}
          className="text-sm text-foreground hover:text-blue-400 truncate transition-colors"
        >
          {email}
        </a>
      </div>
    );
  }

  return (
    <a
      href={`mailto:${email}`}
      className="text-blue-400 hover:text-blue-300 hover:underline text-sm transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {email}
    </a>
  );
}

export function EmailFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <input
      type="email"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}
