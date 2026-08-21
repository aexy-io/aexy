"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { RichText } from "./richText";

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

/** Lines, and characters, past which a body arrives folded. */
const LONG_LINES = 12;
const LONG_CHARS = 900;

/**
 * Whether a body is long enough that it should arrive folded.
 *
 * Decided from the text, not by measuring the rendered height. Measuring means
 * rendering at full height and collapsing in an effect, so every ticket opens
 * with a visible jump; and the answer would depend on the viewport, so the same
 * email would fold on a laptop and not on a monitor.
 *
 * Two thresholds because either alone is wrong: a wall of short lines holds few
 * characters, and three paragraph-length lines hold few newlines but still wrap
 * to half a screen.
 */
export function isLongBody(text: string): boolean {
  if (!text) return false;
  return text.split("\n").length > LONG_LINES || text.length > LONG_CHARS;
}

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

/**
 * A quoted block, and anything quoted inside it, as nested indentation.
 *
 * `unquote` peels one level per step, so a message three replies deep would
 * otherwise still render with `>` on its oldest lines — the markers the reader
 * was complaining about, just fewer of them. Recursing turns depth into a left
 * border, which is what depth means, and leaves no markers at any level.
 *
 * Capped because the depth here comes from whatever arrived in the mail, and a
 * long enough auto-reply loop would otherwise recurse once per exchange.
 */
const MAX_QUOTE_DEPTH = 6;

function QuoteLevels({ text, depth }: { text: string; depth: number }) {
  const { fresh, quoted } = splitQuotedBody(text);
  if (depth >= MAX_QUOTE_DEPTH || !quoted) {
    return <RichText text={text} className="whitespace-pre-wrap break-words" />;
  }
  return (
    <>
      {fresh && <RichText text={fresh} className="whitespace-pre-wrap break-words" />}
      <blockquote className="mt-1 border-l-2 border-border pl-3">
        <QuoteLevels text={unquote(quoted)} depth={depth + 1} />
      </blockquote>
    </>
  );
}

/**
 * Body text that starts folded when it is long.
 *
 * A partner's first email is often the whole history of a case pasted in, and
 * at full height it pushed the ticket's own fields, actions and reply box off
 * the screen — so reading the ticket meant scrolling past the mail to reach
 * anything you could act on. Folding puts the controls back in view and costs
 * one click when the detail is actually wanted.
 */
function FoldedText({ text, testId }: { text: string; testId?: string }) {
  const t = useTranslations("serviceDesk");
  const [expanded, setExpanded] = useState(false);
  const long = isLongBody(text);
  const folded = long && !expanded;

  return (
    <div data-testid={testId}>
      {/* Faded rather than cut square: a hard edge mid-sentence reads as the
          email itself having been truncated, which is a different and much
          more alarming thing than "there is more below". */}
      <div
        data-testid={folded ? "body-folded" : undefined}
        className={
          folded
            ? "relative max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
            : undefined
        }
      >
        <RichText text={text} className="whitespace-pre-wrap break-words" />
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="body-fold-toggle"
          aria-expanded={expanded}
          className="mt-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? t("detail.showLess") : t("detail.showMore")}
        </button>
      )}
    </div>
  );
}

export function QuotedBody({ body }: { body: string }) {
  const t = useTranslations("serviceDesk");
  const [open, setOpen] = useState(false);
  const { fresh, quoted } = useMemo(() => splitQuotedBody(body), [body]);

  return (
    <div className="mt-2 text-sm" data-testid="correspondence-body">
      {fresh && <FoldedText text={fresh} testId="correspondence-fresh" />}
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
              className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground"
            >
              <QuoteLevels text={unquote(quoted)} depth={1} />
            </blockquote>
          )}
        </>
      )}
      {/* A message that is nothing but quoted history still has to show
          something, or the entry renders as an empty box. */}
      {!fresh && !quoted && <FoldedText text={body} />}
    </div>
  );
}
