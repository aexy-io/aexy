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

/**
 * Lines that introduce a quote block.
 *
 * These are high-signal on their own — an email body does not contain "On <date>
 * … wrote:" by accident. `From:` is the exception: it appears in ordinary prose
 * ("From: the customer's perspective…"), so it only counts when it looks like a
 * real header, i.e. it carries an address.
 */
const ATTRIBUTION = [
  /^\s*On\b.+\bwrote:\s*$/i,
  /^\s*-+\s*Original Message\s*-+\s*$/i,
  /^\s*-+\s*Forwarded message\s*-+\s*$/i,
  /^\s*From:\s.*[@<].*$/i,
  /^\s*_{5,}\s*$/,
];

const QUOTE_LINE = /^\s*>/;

export type SplitBody = { fresh: string; quoted: string };

/**
 * Split a body into what is new and what is quoted history.
 *
 * The boundary is the first attribution line, or failing that the start of a run
 * of at least two quote-marked lines. Everything from there down is history.
 *
 * It deliberately does **not** require the remainder to be pure quote. Real mail
 * almost always ends with the sender's own signature *after* the quoted block —
 * a `--`, "Thanks and Regards", a tracking image — and demanding a clean tail
 * meant a forwarded partner request (three levels of `>` and a signature at the
 * bottom) folded nothing at all and rendered every marker raw. Folding the
 * trailing signature along with the history is what mail clients do anyway.
 *
 * Two guards against folding something that isn't history: the boundary must
 * have content above it (a body quoted from its first line is an inline reply
 * above nothing, and collapsing it would leave an empty message), and a lone
 * quote-marked line is ignored, so `if amount > 1000 then escalate` in prose
 * does not trigger it.
 */
export function splitQuotedBody(body: string): SplitBody {
  const lines = (body ?? "").split("\n");

  // "On <date>, <name> <addr> wrote:" frequently wraps, leaving "wrote:" on its
  // own line. Tested against the joined pair as well so the wrapped form folds
  // with the quote instead of dangling above it.
  const isAttribution = (i: number) => {
    const line = lines[i];
    if (ATTRIBUTION.some((re) => re.test(line))) return true;
    if (!/^\s*On\b/.test(line)) return false;
    const joined = `${line.trimEnd()} ${(lines[i + 1] ?? "").trim()}`;
    return ATTRIBUTION.some((re) => re.test(joined));
  };

  let boundary = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isAttribution(i)) {
      boundary = i;
      break;
    }
    // A run of two or more, so a stray ">" mid-sentence is not a boundary.
    if (QUOTE_LINE.test(lines[i]) && QUOTE_LINE.test(lines[i + 1] ?? "")) {
      boundary = i;
      break;
    }
  }

  if (boundary <= 0) return { fresh: body ?? "", quoted: "" };

  const fresh = lines.slice(0, boundary).join("\n").replace(/\s+$/, "");
  const quoted = lines.slice(boundary).join("\n").replace(/\s+$/, "");
  // Nothing above the quote after trimming — treat it as a whole message rather
  // than showing an empty entry with a "show history" button.
  if (!fresh) return { fresh: body ?? "", quoted: "" };
  return { fresh, quoted };
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
