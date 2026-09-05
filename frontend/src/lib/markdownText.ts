/**
 * Markdown → plain text, for the places a post is quoted rather than rendered.
 *
 * Community posts are markdown (see `components/community/MarkdownContent`),
 * but several surfaces consume the same string as prose and have no way to
 * render it: the `<meta name="description">` and OpenGraph description, and the
 * schema.org `text` fields in the thread's JSON-LD. Passing raw markdown to
 * those publishes `## Added - Changelog script…` as the search-result snippet
 * and as the structured-data body.
 *
 * Deliberately a small string pass rather than a real parse. It runs on every
 * public thread render, it only ever produces a short excerpt, and the cost of
 * being wrong is one stray asterisk in a snippet — a markdown AST is not worth
 * the dependency or the work at that stakes. It strips *markup* and keeps
 * *text*, including the contents of code blocks, which are often the part of a
 * release note worth matching on.
 */

/** Link-reference definitions (`[1]: https://…`) carry no prose. */
const LINK_DEFINITION = /^[ \t]*\[[^\]]*\]:.*$/gm;
/** Table delimiter rows (`|---|:--:|`) are pure markup. */
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm;
/** Thematic breaks. */
const THEMATIC_BREAK = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm;
/** Code fences, keeping whatever was inside them. */
const CODE_FENCE = /^[ \t]*(?:```|~~~).*$/gm;
/** Leading blockquote markers, list bullets, task boxes and heading hashes. */
const LINE_PREFIX = /^[ \t]*(?:>[ \t]?)*(?:(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/gm;
/** `![alt](src)` → alt. Run before the link rule so the `!` is consumed. */
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
/** `[text](href)` → text, and `[text][ref]` → text. */
const INLINE_LINK = /\[([^\]]*)\]\([^)]*\)/g;
/**
 * Only a bracket pair *followed by* a reference is unwrapped. A bare `[text]`
 * keeps its brackets, because far more of it is `Optional[str]` and `items[0]`
 * than is a shortcut reference link — unwrapping those produced `Optionalstr`
 * and `items0` in search snippets and meta descriptions.
 */
const REFERENCE_LINK = /\[([^\]]*)\]\[[^\]]*\]/g;
/** `<https://example.com>` → the bare URL. */
const AUTOLINK = /<((?:https?|mailto):[^>\s]+)>/g;
/** Strikethrough and inline-code delimiters, which are unambiguous. */
const EMPHASIS = /(~~|`+)/g;
/**
 * Emphasis delimiters, but only where one can actually open or close emphasis.
 * A `*` or `_` flanked by alphanumerics on both sides is literal in CommonMark,
 * and stripping those anyway turned `run_migrations.py` into `runmigrations.py`
 * and — worse, because it is a different number rather than lost formatting —
 * `4*5=20` into `45=20`.
 */
const FLANKED_EMPHASIS = /(?<![*_A-Za-z0-9])[*_]{1,3}(?![*_])|(?<![*_])[*_]{1,3}(?![*_A-Za-z0-9])/g;

/**
 * Flatten one markdown string to a single line of plain text.
 *
 * Newlines become spaces because every consumer is a one-line field; keeping
 * them would put raw line breaks into an HTML attribute and a JSON-LD value.
 */
export function plainTextFromMarkdown(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(LINK_DEFINITION, "")
    .replace(TABLE_DELIMITER, "")
    .replace(THEMATIC_BREAK, "")
    .replace(CODE_FENCE, "")
    .replace(LINE_PREFIX, "")
    .replace(IMAGE, "$1")
    .replace(INLINE_LINK, "$1")
    .replace(REFERENCE_LINK, "$1")
    .replace(AUTOLINK, "$1")
    .replace(EMPHASIS, "")
    .replace(FLANKED_EMPHASIS, "")
    // Table cell pipes read as separators, not as text.
    .replace(/[ \t]*\|[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A plain-text excerpt of at most `max` characters, cut at a word boundary.
 *
 * Truncating mid-word is what a naive `slice` does, and it is visible in a
 * search result — "Adds the changelog publis…" reads as a broken page.
 */
export function excerptFromMarkdown(markdown: string, max: number): string {
  const text = plainTextFromMarkdown(markdown);
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only honour the word boundary if it isn't throwing most of the excerpt
  // away — a single very long token should still be cut rather than vanish.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}
