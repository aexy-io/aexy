/**
 * Aexy's document-edit ops, replayed into a live editor.
 *
 * Two op vocabularies exist and they are not the same thing:
 *
 *  - **Aexy ops** are what an agent writes and what a proposal stores —
 *    `replace_text`, `append_section`, and so on. Coarse, human-legible, and
 *    reviewable in a queue before anyone opens the document.
 *  - **Automation ops** are the engine's protocol — `search`, `replaceSpan`,
 *    `insertParagraph`. Precise, position-addressed, and only meaningful against
 *    a document that is already open.
 *
 * This module translates the first into the second. It exists at all because
 * replaying an agent's edits through the *editor* is the only way to get a
 * tracked-changes redline: the Python backend can apply the same ops losslessly
 * but cannot write `w:ins`/`w:del`, so an edit applied there is a fait accompli
 * rather than something a person can accept or reject.
 *
 * Not every Aexy op has a faithful translation yet. Those are **reported, never
 * approximated** — an op silently doing something adjacent to what it said is
 * far worse here than one that declines and says so, because the reviewer is
 * looking at a redline they believe is the whole proposal.
 */

import type { AutomationHost } from "@docx-editor.dev/core/automation";

/** One edit as stored on a proposal. Mirrors the backend's `_SUPPORTED_OPS`. */
export interface AexyDocxOp {
  kind: string;
  find?: string;
  replace?: string;
  count?: number;
  heading?: string;
  level?: number;
  markdown?: string;
  table_index?: number;
  row?: number;
  column?: number;
  text?: string;
  /**
   * Resolved by the backend when the proposal is written: what the target cell
   * said at that moment. The browser cannot address a cell by coordinate, so
   * this is what makes `set_table_cell` reviewable — and it is also a cell-level
   * staleness check.
   */
  expected_current?: string;
  /** Human label for the cell, e.g. "Pricing tiers row 2, column 3". */
  cell_label?: string;
  /**
   * Set by the backend when it could not resolve the cell or the comment — an
   * out-of-range coordinate, a cell holding more than one paragraph whose text
   * spans a break that a document-text search cannot match, or a comment that
   * has since been deleted. Carries the reason so the reviewer is told what is
   * actually wrong.
   */
  unresolvable?: string;

  // ── comment ops ──
  /** `add_comment`: the words in the document to attach the remark to. */
  anchor_find?: string;
  /** `reply_to_comment` / `resolve_comment`: the OOXML `w:id` of the target. */
  comment_id?: string;
  /**
   * What the target comment said when the AI read it, stamped by the backend.
   *
   * A `w:id` is unique within one package and nothing more — Word reuses one
   * once the comment holding it is deleted — so replying by id alone can land
   * on a different remark that inherited the number. Checked before writing.
   */
  expected_comment_author?: string;
  expected_comment_text?: string;
}

export interface SkippedOp {
  index: number;
  kind: string;
  reason: string;
}

export interface ApplyOpsResult {
  /** How many ops were fully applied. */
  applied: number;
  /** Ops that could not be replayed here, each with why. */
  skipped: SkippedOp[];
}

/**
 * Op kinds this module can replay into an open editor.
 *
 * The rest are applied by the backend without a redline. Kept as an explicit set
 * rather than inferred from a switch's default branch so the UI can tell a
 * reviewer *before* they start whether the proposal they are opening is fully
 * reviewable.
 */
/**
 * The ops that arrive as a comment rather than as a tracked change.
 *
 * Separate from `REDLINE_SUPPORTED_OPS`, which answers "can the browser replay
 * it" — a comment op is replayable AND not a redline, so one set cannot answer
 * both questions.
 */
export const COMMENT_OPS = new Set([
  "add_comment",
  "reply_to_comment",
  "resolve_comment",
]);

export const REDLINE_SUPPORTED_OPS = new Set([
  "replace_text",
  "append_section",
  "replace_section_body",
  "set_table_cell",
  // Not redlines at all — a comment is its own reviewable object, and these
  // three write one, answer one, and close one. Listed here because this set
  // answers "can the browser replay it", which is the question the banner asks
  // before telling a reviewer the proposal is complete.
  "add_comment",
  "reply_to_comment",
  "resolve_comment",
]);

export function opsAreFullyReviewable(ops: readonly AexyDocxOp[]): boolean {
  return ops.every((op) => REDLINE_SUPPORTED_OPS.has(op.kind));
}

type Handle = { readonly kind: string; readonly ref: string };

function ok(response: { ok: boolean; results: readonly unknown[] }, index = 0) {
  if (!response.ok) return null;
  const result = response.results[index] as
    | { status: string; value?: unknown }
    | undefined;
  if (!result || result.status !== "ok") return null;
  return result.value as Record<string, unknown>;
}

/** The main story's handle, which every other addressing form hangs off. */
function bodyHandle(host: AutomationHost): Handle | null {
  const document = ok(
    host.execute({ operations: [{ op: "getDocument" }] } as never) as never
  );
  const documentHandle = document?.handle as Handle | undefined;
  if (!documentHandle) return null;

  const body = ok(
    host.execute({
      operations: [{ op: "getBody", document: documentHandle }],
    } as never) as never
  );
  return (body?.handle as Handle | undefined) ?? null;
}

/**
 * Replace every occurrence of `find`, from the last match backwards.
 *
 * One search pass, applied in reverse document order. Both halves of that
 * matter, and the naive alternative is actively broken:
 *
 * Re-searching after each replacement loops for ever in suggesting mode. A
 * tracked replacement does not remove the original text — it wraps it in
 * `w:del` and inserts the new text beside it — so the very next search for the
 * same phrase finds the text it just "replaced" and replaces it again. The
 * symptom is a paragraph containing the replacement fifty times over, and the
 * revision counts look entirely plausible while it happens.
 *
 * Reverse order is what makes a single pass safe: an edit at one position shifts
 * the offsets of everything *after* it, so walking backwards leaves every span
 * not yet processed still describing the document it was found in.
 */
function replaceText(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { applied: boolean; reason?: string } {
  const find = op.find ?? "";
  if (!find) return { applied: false, reason: "no text to find" };
  const replacement = op.replace ?? "";

  const found = ok(
    host.execute({
      operations: [{ op: "search", scope: { body }, text: find }],
    } as never) as never
  );
  const spans = (found?.spans as readonly unknown[] | undefined) ?? [];

  if (spans.length === 0) {
    return { applied: false, reason: `"${find}" is not in this document` };
  }
  // Checked before editing, not after: an op that expected three occurrences and
  // found one was written against a different document, and half-applying it is
  // the worst of the three options.
  if (op.count !== undefined && spans.length !== op.count) {
    return {
      applied: false,
      reason: `expected ${op.count} occurrence(s) but found ${spans.length}`,
    };
  }

  let replaced = 0;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const edited = host.execute({
      operations: [{ op: "replaceSpan", span: spans[index], text: replacement }],
    } as never) as { ok: boolean };
    if (edited.ok) replaced += 1;
  }

  if (replaced === 0) {
    return { applied: false, reason: "the editor refused the replacement" };
  }
  if (replaced !== spans.length) {
    return {
      applied: false,
      reason: `only ${replaced} of ${spans.length} occurrence(s) could be replaced`,
    };
  }
  return { applied: true };
}

/** Append a heading and its body at the end of the main story. */
function appendSection(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { applied: boolean; reason?: string } {
  const heading = op.heading ?? "";
  if (!heading) return { applied: false, reason: "no heading" };

  const level = Math.min(Math.max(op.level ?? 2, 1), 9);

  // A paragraph anchor is `{paragraph}` or `{body, at}` — never a bare handle,
  // which the engine rejects as `not-a-body-handle`. `{body, at: "last"}` also
  // saves enumerating every paragraph just to find the end.
  const inserted = ok(
    host.execute({
      operations: [
        {
          op: "insertParagraph",
          anchor: { body, at: "last" },
          where: "after",
          text: heading,
        },
      ],
    } as never) as never
  );
  const headingHandle = inserted?.handle as Handle | undefined;
  if (!headingHandle) {
    return { applied: false, reason: "the editor refused the new heading" };
  }

  // Style it as a heading so it lands in the outline rather than as prose that
  // merely looks like a title. Best-effort: a template without the style should
  // not lose the section.
  host.execute({
    operations: [
      {
        op: "setStyle",
        span: { paragraph: headingHandle },
        name: `Heading ${level}`,
      },
    ],
  } as never);

  let anchor: Handle = headingHandle;
  // Markdown is not parsed here — the body arrives as prose, one paragraph per
  // blank-line-separated block. A proposal that needs tables or lists inside a
  // new section is one the backend applies without a redline.
  const blocks = (op.markdown ?? "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  for (const block of blocks) {
    const next = ok(
      host.execute({
        operations: [
          {
            op: "insertParagraph",
            anchor: { paragraph: anchor },
            where: "after",
            text: block,
          },
        ],
      } as never) as never
    );
    const handle = next?.handle as Handle | undefined;
    if (!handle) break;
    anchor = handle;
  }

  return { applied: true };
}

const HEADING_STYLE = /^heading\s*([1-9])$/i;

/** A paragraph's style name, or "" when the engine will not say. */
function styleOf(host: AutomationHost, paragraph: Handle): string {
  const value = ok(
    host.execute({
      operations: [{ op: "getStyle", span: { paragraph } }],
    } as never) as never
  );
  return ((value?.style ?? value?.name ?? value?.text) as string | undefined) ?? "";
}

/** A paragraph's text, or "". */
function textOf(host: AutomationHost, paragraph: Handle): string {
  const value = ok(
    host.execute({ operations: [{ op: "getText", target: paragraph }] } as never) as never
  );
  return ((value?.text as string | undefined) ?? "").trim();
}

/** The heading level a paragraph's style declares, or null for body text. */
function headingLevelOf(host: AutomationHost, paragraph: Handle): number | null {
  const match = HEADING_STYLE.exec(styleOf(host, paragraph).trim());
  return match ? Number(match[1]) : null;
}

function bodyParagraphs(host: AutomationHost, body: Handle): readonly Handle[] {
  const value = ok(
    host.execute({ operations: [{ op: "getParagraphs", body }] } as never) as never
  );
  return (value?.handles as readonly Handle[] | undefined) ?? [];
}

/**
 * Find a heading and where its section ends.
 *
 * Two strategies, because one is not enough. The style-name strategy reads
 * `Heading 2` and knows the level, which gives the correct extent: stop at the
 * next heading of the same or a higher level, so a deeper subsection stays part
 * of this section.
 *
 * That strategy fails completely on a document whose heading styles are not
 * called "Heading N" — one authored in a non-English Word ("Titre 1",
 * "शीर्षक 1") or built from a corporate template ("AcmeHeading"). The backend
 * handles those by reading `w:outlineLvl`, which every such style still carries;
 * **the automation protocol does not expose it at all**, so that fallback is not
 * available here.
 *
 * So the second strategy uses the style as an opaque token: find the one
 * paragraph whose text is the heading and whose style is not body text, then end
 * the section at the next paragraph sharing that same style. Headings of one
 * level share a style, so this lands in the right place without ever knowing
 * what the level was. It requires a unique text match, because without a level
 * there is nothing else to disambiguate two identically-titled sections.
 */
function locateHeading(
  host: AutomationHost,
  paragraphs: readonly Handle[],
  heading: string
): { anchorIndex: number; end: number } | null {
  const styles = paragraphs.map((p) => styleOf(host, p).trim());
  const levels = paragraphs.map((p) => headingLevelOf(host, p));
  const texts = paragraphs.map((p) => textOf(host, p));

  // Strategy 1: a real "Heading N" style, which carries its level.
  for (let index = 0; index < paragraphs.length; index += 1) {
    if (levels[index] !== null && texts[index] === heading) {
      const level = levels[index] as number;
      let end = paragraphs.length;
      for (let next = index + 1; next < paragraphs.length; next += 1) {
        const found = levels[next];
        if (found !== null && found <= level) {
          end = next;
          break;
        }
      }
      return { anchorIndex: index, end };
    }
  }

  // Strategy 2: an unrecognised heading style, matched by text and bounded by
  // the next paragraph wearing the same style.
  const candidates: number[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const style = styles[index];
    const isBody = !style || /^(normal|body ?text|default)$/i.test(style);
    if (!isBody && texts[index] === heading) candidates.push(index);
  }
  if (candidates.length !== 1) return null;

  const anchorIndex = candidates[0];
  const anchorStyle = styles[anchorIndex];
  let end = paragraphs.length;
  for (let next = anchorIndex + 1; next < paragraphs.length; next += 1) {
    if (styles[next] === anchorStyle) {
      end = next;
      break;
    }
  }
  return { anchorIndex, end };
}

/**
 * Replace everything under a heading, leaving the heading itself.
 *
 * The extent is decided the same way the backend decides it: stop at the next
 * heading of the same or a higher level. A deeper heading is *part* of this
 * section, so swallowing it would silently delete a subsection the proposal
 * never mentioned.
 *
 * The old text is removed with `replaceSpan`, **not** `deleteParagraph`. That
 * distinction is the whole reviewability of this op, and it is not obvious:
 * `deleteParagraph` is destructive even in suggesting mode — the text vanishes
 * from the file with no `w:del`, so a reviewer has nothing to reject.
 * `replaceSpan` over the same paragraph records a proper tracked deletion and
 * keeps the original text in the document. Verified against the engine both
 * ways; the counts alone did not show it, the saved XML did.
 *
 * The cost is that emptied paragraph marks remain until the changes are
 * accepted, because marking a paragraph mark itself deleted is not reachable
 * through this protocol. A reviewer sees struck-through text followed by blank
 * lines, which is legible; the alternative is losing the text outright.
 */
function replaceSectionBody(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { applied: boolean; reason?: string } {
  const heading = (op.heading ?? "").trim();
  if (!heading) return { applied: false, reason: "no heading" };

  const paragraphs = bodyParagraphs(host, body);
  if (paragraphs.length === 0) {
    return { applied: false, reason: "this document has no paragraphs" };
  }

  const located = locateHeading(host, paragraphs, heading);
  if (!located) {
    return { applied: false, reason: `no heading titled "${heading}"` };
  }
  const { anchorIndex, end } = located;
  if (end === anchorIndex + 1 && !(op.markdown ?? "").trim()) {
    return { applied: false, reason: "that section is already empty" };
  }

  const blocks = (op.markdown ?? "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  // Last-first, matching every other edit here: handles are stable but offsets
  // are not, and this keeps the two consistent rather than relying on it.
  for (let index = end - 1; index > anchorIndex; index -= 1) {
    // The first old paragraph carries the replacement text so the redline reads
    // as "this became that" rather than as a deletion next to an insertion.
    const replacement = index === anchorIndex + 1 ? (blocks[0] ?? "") : "";
    host.execute({
      operations: [
        { op: "replaceSpan", span: { paragraph: paragraphs[index] }, text: replacement },
      ],
    } as never);
  }

  // Anything past the first block is genuinely new and is inserted as such.
  let cursor: Handle = paragraphs[Math.min(anchorIndex + 1, end - 1)];
  if (end === anchorIndex + 1) cursor = paragraphs[anchorIndex];
  for (const block of blocks.slice(1)) {
    const next = ok(
      host.execute({
        operations: [
          {
            op: "insertParagraph",
            anchor: { paragraph: cursor },
            where: "after",
            text: block,
          },
        ],
      } as never) as never
    );
    const handle = next?.handle as Handle | undefined;
    if (!handle) {
      return { applied: false, reason: "the editor refused the replacement text" };
    }
    cursor = handle;
  }

  return { applied: true };
}

/**
 * Change one table cell's text.
 *
 * The automation protocol has no table operations at all — no enumeration, no
 * cell addressing — so `(table, row, column)` cannot be resolved here. The
 * backend resolves it instead: it holds the bytes, already extracts every table,
 * and stamps the cell's current text onto the op as `expected_current` when the
 * proposal is written.
 *
 * That turns an unaddressable coordinate into a uniqueness-checked replacement,
 * and it doubles as a cell-level staleness check: if the cell no longer says what
 * the agent saw, the edit is refused rather than applied to different content.
 *
 * Ambiguity is refused, never guessed. A table full of "Yes" cells gives no way
 * to tell which one was meant, and editing the wrong cell of a pricing table is
 * worse than declining.
 */
function setTableCell(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { applied: boolean; reason?: string } {
  if (op.unresolvable) {
    // The backend already worked out why this cell cannot be located and said
    // so; repeating a vaguer guess here would bury the real reason.
    return { applied: false, reason: op.unresolvable };
  }

  const current = (op.expected_current ?? "").trim();
  const label = op.cell_label ?? "that cell";
  if (!current) {
    return {
      applied: false,
      reason: "the cell's current text is unknown, so it cannot be located",
    };
  }

  const found = ok(
    host.execute({
      operations: [{ op: "search", scope: { body }, text: current }],
    } as never) as never
  );
  const spans = (found?.spans as readonly unknown[] | undefined) ?? [];

  if (spans.length === 0) {
    return {
      applied: false,
      reason: `${label} no longer says "${current}"`,
    };
  }
  if (spans.length > 1) {
    return {
      applied: false,
      reason: `"${current}" appears ${spans.length} times, so ${label} cannot be identified`,
    };
  }

  const edited = host.execute({
    operations: [{ op: "replaceSpan", span: spans[0], text: op.text ?? "" }],
  } as never) as { ok: boolean };
  return edited.ok
    ? { applied: true }
    : { applied: false, reason: "the editor refused the replacement" };
}

/**
 * The comment carrying `commentId`, searched depth-first through the threads.
 *
 * `getComments` lists only thread PARENTS — a reply is reachable solely through
 * its parent's `getCommentReplies` — so a flat scan of the top level silently
 * fails to find exactly the comments an `@aexy` reply is most likely aimed at.
 *
 * Matched on `getCommentId`, which returns the OOXML `w:id`. Deliberately not
 * on the handle ref: a ref happens to be `comment:<doc>:<n>` with `n` one
 * greater than the id today, and arithmetic on an opaque ref is the kind of
 * coincidence that works until the engine renumbers.
 */
function findComment(
  host: AutomationHost,
  body: Handle,
  commentId: string
): Handle | null {
  const roots =
    (ok(
      host.execute({
        operations: [{ op: "getComments", scope: { body } }],
      } as never) as never
    )?.handles as readonly Handle[] | undefined) ?? [];

  const search = (handles: readonly Handle[]): Handle | null => {
    for (const handle of handles) {
      const id = ok(
        host.execute({
          operations: [{ op: "getCommentId", comment: handle }],
        } as never) as never
      )?.text;
      if (String(id) === commentId) return handle;

      const replies =
        (ok(
          host.execute({
            operations: [{ op: "getCommentReplies", comment: handle }],
          } as never) as never
        )?.handles as readonly Handle[] | undefined) ?? [];
      const found = search(replies);
      if (found) return found;
    }
    return null;
  };

  return search(roots);
}

/**
 * Resolve a comment op's target, refusing when the document has moved on.
 *
 * The backend stamps what the comment said when the AI read it. Checking it
 * here is the comment-level equivalent of `set_table_cell`'s `expected_current`:
 * a reused `w:id` would otherwise make the AI answer a remark nobody wrote.
 */
function commentTarget(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { handle: Handle } | { reason: string } {
  const commentId = op.comment_id;
  if (commentId === undefined || commentId === null || commentId === "") {
    return { reason: "no comment to act on" };
  }

  const handle = findComment(host, body, String(commentId));
  if (!handle) return { reason: "that comment is no longer in this document" };

  if (op.expected_comment_text !== undefined) {
    const current = ok(
      host.execute({
        operations: [{ op: "getCommentText", comment: handle }],
      } as never) as never
    )?.text;
    if (String(current ?? "") !== op.expected_comment_text) {
      return { reason: "that comment has been edited since this was drafted" };
    }
  }

  return { handle };
}

/**
 * Attach a new remark to the first occurrence of `anchor_find`.
 *
 * `insertComment`, `replyToComment` and `setCommentResolved` are SOLITARY
 * operations in the protocol: each commits as its own package transaction and
 * the engine refuses a batch holding one beside anything else. Every handler
 * here issues exactly one op per `execute`, which satisfies that by
 * construction — but it is why the search and the insert below cannot be
 * combined into one round trip the way the text ops could be.
 */
function addComment(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp,
  author: string
): { applied: boolean; reason?: string } {
  const anchor = op.anchor_find ?? "";
  if (!anchor) return { applied: false, reason: "no text to comment on" };
  const text = op.text ?? "";
  if (!text) return { applied: false, reason: "the comment is empty" };

  const found = ok(
    host.execute({
      operations: [{ op: "search", scope: { body }, text: anchor }],
    } as never) as never
  );
  const spans = (found?.spans as readonly unknown[] | undefined) ?? [];
  if (spans.length === 0) {
    return { applied: false, reason: `"${anchor}" is not in this document` };
  }

  // The first occurrence, not all of them: a remark is about one place, and a
  // model that meant every occurrence would have said so as a replace_text.
  const inserted = host.execute({
    operations: [{ op: "insertComment", span: spans[0], text, author }],
  } as never) as { ok: boolean };
  return inserted.ok
    ? { applied: true }
    : { applied: false, reason: "the editor refused the comment" };
}

function replyToComment(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp,
  author: string
): { applied: boolean; reason?: string } {
  const text = op.text ?? "";
  if (!text) return { applied: false, reason: "the reply is empty" };

  const target = commentTarget(host, body, op);
  if ("reason" in target) return { applied: false, reason: target.reason };

  const replied = host.execute({
    operations: [
      { op: "replyToComment", comment: target.handle, text, author },
    ],
  } as never) as { ok: boolean };
  return replied.ok
    ? { applied: true }
    : { applied: false, reason: "the editor refused the reply" };
}

/**
 * Close a comment thread.
 *
 * Resolving is a THREAD operation in Word — the remark and its replies together
 * — which is why one op closes what may be several cards in the rail.
 */
function resolveComment(
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp
): { applied: boolean; reason?: string } {
  const target = commentTarget(host, body, op);
  if ("reason" in target) return { applied: false, reason: target.reason };

  const done = host.execute({
    operations: [
      { op: "setCommentResolved", comment: target.handle, resolved: true },
    ],
  } as never) as { ok: boolean };
  return done.ok
    ? { applied: true }
    : { applied: false, reason: "the editor refused to resolve it" };
}

type OpHandler = (
  host: AutomationHost,
  body: Handle,
  op: AexyDocxOp,
  author: string
) => { applied: boolean; reason?: string };

const HANDLERS: Record<string, OpHandler> = {
  replace_text: replaceText,
  append_section: appendSection,
  replace_section_body: replaceSectionBody,
  set_table_cell: setTableCell,
  add_comment: addComment,
  reply_to_comment: replyToComment,
  resolve_comment: resolveComment,
};

/**
 * Replay a proposal's ops into the open document.
 *
 * The editor's mode decides whether these land as tracked changes: in
 * `'suggesting'` every edit becomes `w:ins`/`w:del`, which is what makes the
 * result reviewable. This function does not set the mode — it is sampled at
 * mount, so the caller opens the document in the right one.
 */
/** One line of the review rail: what a single op does, in a person's words. */
export interface OpSummary {
  index: number;
  kind: string;
  /** What it does, e.g. "Replace text" — short enough to be a row heading. */
  action: string;
  /** Where or what it touches: the found text, the cell label, the heading. */
  target: string;
  /** What it becomes, when the op has a replacement worth showing. */
  becomes?: string;
  /**
   * False when the browser cannot replay this op at all — the backend applies it
   * on accept, and no markup will ever appear in the editor. A reviewer told
   * otherwise goes looking for a change that is not there.
   */
  replayable: boolean;
  /**
   * True for the three comment ops. They ARE replayable, but they arrive as
   * comments rather than tracked changes — a distinction the rail has to draw,
   * because "replayable" and "shows up as a redline" are not the same question
   * and conflating them tells the reviewer to look in the wrong place.
   */
  asComment: boolean;
  /**
   * Set when the backend already knew this op could not be resolved — an
   * out-of-range table coordinate, a comment that has since been deleted.
   * Carried through so the rail shows it before the reviewer replays, rather
   * than after.
   */
  unresolvable?: string;
}

/** A short, quotable piece of text. */
function excerpt(value: string | undefined, limit = 80): string {
  const flat = (value ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/**
 * Describe a proposal's ops for the review rail.
 *
 * Exists because "12 changes waiting" is not reviewable information. A person
 * deciding whether to replay a proposal into a forty-page contract needs to see
 * what is in it, and once the redline is in the document they need to be able to
 * tell one marked-up passage from another.
 *
 * Pure, and independent of the editor: the rail renders before anything is
 * replayed, which is the point — it is what you read *instead of* guessing.
 */
export function summariseOps(ops: readonly AexyDocxOp[]): OpSummary[] {
  return ops.map((op, index) => {
    const base = {
      index,
      kind: op.kind,
      replayable: REDLINE_SUPPORTED_OPS.has(op.kind),
      asComment: COMMENT_OPS.has(op.kind),
      unresolvable: op.unresolvable,
    };

    switch (op.kind) {
      case "replace_text":
        return {
          ...base,
          action: "Replace text",
          target: excerpt(op.find),
          becomes: excerpt(op.replace) || "(deleted)",
        };
      case "set_table_cell":
        return {
          ...base,
          action: "Change a table cell",
          // The label when the backend resolved one; otherwise the coordinate,
          // which is at least addressable.
          target:
            op.cell_label ||
            excerpt(op.expected_current) ||
            `table cell`,
          becomes: excerpt(op.text),
        };
      case "append_section":
        return {
          ...base,
          action: "Add a section",
          target: excerpt(op.heading) || "at the end",
          becomes: excerpt(op.markdown),
        };
      case "replace_section_body":
        return {
          ...base,
          action: "Rewrite a section",
          target: excerpt(op.heading),
          becomes: excerpt(op.markdown),
        };
      case "add_comment":
        return {
          ...base,
          action: "Leave a comment",
          target: excerpt(op.anchor_find),
          becomes: excerpt(op.text),
        };
      case "reply_to_comment":
        return {
          ...base,
          action: "Reply to a comment",
          target: excerpt(op.expected_comment_text) || `comment ${op.comment_id}`,
          becomes: excerpt(op.text),
        };
      case "resolve_comment":
        return {
          ...base,
          action: "Resolve a comment",
          target: excerpt(op.expected_comment_text) || `comment ${op.comment_id}`,
        };
      default:
        // An op kind this build does not know about — a proposal written by a
        // newer backend. Named rather than hidden, so the count in the rail
        // still matches the count in the banner.
        return { ...base, action: op.kind, target: "" };
    }
  });
}

export function applyAexyOps(
  host: AutomationHost,
  ops: readonly AexyDocxOp[],
  options: { author?: string } = {}
): ApplyOpsResult {
  // `w:author` is required on a comment, so the engine refuses one with neither
  // an ambient nor an explicit author. Named here rather than stored on the op:
  // what the AI is called is a workspace setting, and a proposal drafted last
  // week should adopt today's answer.
  const author = options.author?.trim() || "Aexy AI";

  const skipped: SkippedOp[] = [];
  let applied = 0;

  const body = bodyHandle(host);
  if (!body) {
    return {
      applied: 0,
      skipped: ops.map((op, index) => ({
        index,
        kind: op.kind,
        reason: "the document could not be addressed",
      })),
    };
  }

  ops.forEach((op, index) => {
    if (!REDLINE_SUPPORTED_OPS.has(op.kind)) {
      skipped.push({
        index,
        kind: op.kind,
        reason: "cannot be shown as a tracked change yet",
      });
      return;
    }

    // Explicit, with no catch-all: an op added to REDLINE_SUPPORTED_OPS but not
    // routed here must say so rather than fall into whichever handler happened
    // to be last.
    const handler = HANDLERS[op.kind];
    const outcome = handler
      ? handler(host, body, op, author)
      : { applied: false, reason: "is supported but not routed — this is a bug" };

    if (outcome.applied) applied += 1;
    else
      skipped.push({
        index,
        kind: op.kind,
        reason: outcome.reason ?? "could not be applied",
      });
  });

  return { applied, skipped };
}
