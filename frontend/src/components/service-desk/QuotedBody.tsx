"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * An email body with its quoted history folded away.
 *
 * Correspondence was rendered raw in a `whitespace-pre-wrap` block, so every
 * reply carried the whole thread again behind `>` and `>>` markers. The ticket's
 * newest message — the only part anybody is reading for — sat above several
 * screens of text they had already read, repeated once per reply.
 *
 * The quoted part is folded, not dropped: it is the record of what was actually
 * sent, and on a ticket that has been forwarded twice it is sometimes the only
 * place the original request survives.
 */

/** Lines that introduce a quote block, e.g. "On Tue, 3 Jun, X wrote:". */
const ATTRIBUTION = [
  /^\s*On .+ wrote:\s*$/i,
  /^\s*-+\s*Original Message\s*-+\s*$/i,
  /^\s*-+\s*Forwarded message\s*-+\s*$/i,
  /^\s*From:\s.+$/i,
  /^\s*_{5,}\s*$/,
];

export type SplitBody = { fresh: string; quoted: string };

/**
 * Split a body into what is new and what is quoted history.
 *
 * The boundary is the first line that is either quote-marked (`>`…) or a
 * recognised attribution line, provided something precedes it — a body that is
 * quoted from its very first line is somebody replying inline above nothing, so
 * it stays whole rather than collapsing to an empty message.
 */
export function splitQuotedBody(body: string): SplitBody {
  const lines = (body ?? "").split("\n");
  let boundary = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isQuote = /^\s*>/.test(line);
    const isAttribution = ATTRIBUTION.some((re) => re.test(line));
    if (!isQuote && !isAttribution) continue;
    // Everything from here on has to be quote, attribution or blank, or this is
    // a stray ">" in prose rather than the start of the history.
    const restIsHistory = lines
      .slice(i)
      .every(
        (l) =>
          l.trim() === "" ||
          /^\s*>/.test(l) ||
          ATTRIBUTION.some((re) => re.test(l)) ||
          // Header lines inside a forwarded block.
          /^\s*(To|Cc|Bcc|Sent|Date|Subject|Reply-To):\s/i.test(l),
      );
    if (restIsHistory) {
      boundary = i;
      break;
    }
  }

  if (boundary <= 0) return { fresh: body ?? "", quoted: "" };
  return {
    fresh: lines.slice(0, boundary).join("\n").replace(/\s+$/, ""),
    quoted: lines.slice(boundary).join("\n").replace(/\s+$/, ""),
  };
}

/** Strip one level of "> " so the folded history reads as text, not markup. */
function unquote(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n");
}

export function QuotedBody({ body }: { body: string }) {
  const t = useTranslations("serviceDesk");
  const [open, setOpen] = useState(false);
  const { fresh, quoted } = useMemo(() => splitQuotedBody(body), [body]);

  return (
    <div className="mt-2 text-sm" data-testid="correspondence-body">
      {fresh && (
        <p className="whitespace-pre-wrap break-words" data-testid="correspondence-fresh">
          {fresh}
        </p>
      )}
      {quoted && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid="correspondence-quote-toggle"
            aria-expanded={open}
            className="mt-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {open ? t("detail.hideQuoted") : t("detail.showQuoted")}
          </button>
          {open && (
            <blockquote
              data-testid="correspondence-quoted"
              className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs text-muted-foreground"
            >
              {unquote(quoted)}
            </blockquote>
          )}
        </>
      )}
      {/* A message that is nothing but quoted history still has to show
          something, or the entry renders as an empty box. */}
      {!fresh && !quoted && (
        <p className="whitespace-pre-wrap break-words">{body}</p>
      )}
    </div>
  );
}
