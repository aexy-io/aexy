"use client";

import { FieldViewProps, FieldEditProps } from "../types";

/**
 * Simple markdown-like rendering: bold, italic, inline code, links.
 * Not a full markdown parser — just the basics for short text fields.
 */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Process in segments: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 bg-accent rounded text-xs font-mono">
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

export function TextareaFieldView({ value, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "\u2014"}</span>;
  }
  const text = String(value);
  const variant = displayConfig?.variant;

  if (surface === "table_cell" || surface === "kanban_card") {
    const truncated = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
    if (variant === "markdown") {
      return <span className="text-sm text-foreground">{renderSimpleMarkdown(truncated)}</span>;
    }
    return <span className="text-sm text-foreground">{truncated}</span>;
  }

  if (variant === "markdown") {
    return (
      <div className="text-sm text-foreground whitespace-pre-wrap">
        {text.split("\n").map((line, i) => (
          <p key={i} className={line.trim() === "" ? "h-3" : undefined}>
            {renderSimpleMarkdown(line)}
          </p>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>;
}

export function TextareaFieldEdit({ value, onChange, required, placeholder, autoFocus, className }: FieldEditProps) {
  return (
    <textarea
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={3}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none"}
    />
  );
}
