import type { ReactNode } from "react";

/**
 * Render a search snippet, highlighting the terms the backend matched.
 *
 * The snippet arrives from PostgreSQL's `ts_headline`, which wraps matched
 * words in `<mark>…</mark>` and does not escape the body text around them.
 * It strips well-formed tags it recognises, which is easy to mistake for
 * safety — it is not. Checked against a real database: a body containing
 * `<img src=x onerror=alert(1)` with no closing bracket comes back in the
 * snippet verbatim, and a browser parses that unclosed tag as an element.
 * The semantic half of search skips `ts_headline` entirely and returns raw
 * chunk text. So the one thing this must never become is
 * `dangerouslySetInnerHTML`.
 *
 * So the markers are parsed out and rebuilt as elements. Everything between
 * them stays a text node, which React escapes on the way in, and the snippet
 * cannot introduce markup no matter what somebody typed into a page.
 *
 * Snippets from the semantic half of search are plain chunk text with no
 * markers at all; those come back as a single unhighlighted run, which is the
 * honest rendering — nothing in them was keyword-matched.
 */

/** Split on the markers while keeping them, so state can be tracked. */
const MARKER = /(<mark>|<\/mark>)/g;

export function highlightSnippet(snippet: string): ReactNode[] {
  const out: ReactNode[] = [];
  let highlighted = false;

  snippet.split(MARKER).forEach((part, index) => {
    if (part === "<mark>") {
      highlighted = true;
      return;
    }
    if (part === "</mark>") {
      highlighted = false;
      return;
    }
    if (!part) return;

    // Unbalanced markers just leave `highlighted` where it was rather than
    // throwing: a snippet is decoration on a result that is already correct,
    // and a truncated `ts_headline` fragment must not blank the row.
    out.push(
      highlighted ? (
        <mark
          key={index}
          className="bg-primary-500/25 text-foreground rounded-[2px] px-0.5"
        >
          {part}
        </mark>
      ) : (
        <span key={index}>{part}</span>
      ),
    );
  });

  return out;
}
