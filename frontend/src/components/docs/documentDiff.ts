/**
 * Turning two TipTap documents into something a person can read.
 *
 * The review UI used to render `JSON.stringify(proposed_content, null, 2)`
 * and label the other column "(use editor view to see current document)".
 * That is the only gate between an automated rewrite and the team's
 * documentation, and it asked the reviewer to read a JSON dump against
 * nothing. Comparing prose to prose is the whole point.
 */

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  /** Heading level 1-6, or 0 for body text. Lets the view show shape. */
  level: number;
}

interface Block {
  text: string;
  level: number;
}

type Node = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: Node[];
};

/**
 * Flatten a TipTap document to its readable blocks.
 *
 * Marks, anchors and attributes are deliberately dropped: a reviewer is
 * deciding whether the *words* are right. A bold span moving is not a
 * change worth flagging, and including it would bury the ones that are.
 */
export function extractBlocks(doc: unknown): Block[] {
  const blocks: Block[] = [];

  const textOf = (node: Node): string => {
    if (typeof node.text === "string") return node.text;
    if (!Array.isArray(node.content)) return "";
    return node.content.map(textOf).join("");
  };

  const walk = (node: Node) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "heading" || node.type === "paragraph") {
      const text = textOf(node).trim();
      if (text) {
        const level =
          node.type === "heading" ? Number(node.attrs?.level ?? 1) || 1 : 0;
        blocks.push({ text, level });
      }
      return;
    }

    if (node.type === "codeBlock") {
      const text = textOf(node).trim();
      // Code is compared whole rather than line by line: a reviewer reading a
      // documentation diff wants to know the sample changed, not which
      // character moved.
      if (text) blocks.push({ text, level: 0 });
      return;
    }

    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk((doc ?? {}) as Node);
  return blocks;
}

/**
 * A longest-common-subsequence diff over blocks.
 *
 * LCS rather than a naive index-by-index comparison because inserting one
 * paragraph near the top would otherwise mark every block below it as
 * changed — which reads as "the AI rewrote everything" and trains people to
 * approve without looking.
 *
 * Bounded: past `maxBlocks` the table costs more than the answer is worth,
 * and the caller is better served by the section summary.
 */
export function diffBlocks(
  before: Block[],
  after: Block[],
  maxBlocks = 400
): DiffLine[] | null {
  if (before.length > maxBlocks || after.length > maxBlocks) return null;

  const n = before.length;
  const m = after.length;
  // lengths[i][j] = LCS length of before[i..] and after[j..]
  const lengths: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] =
        before[i].text === after[j].text
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i].text === after[j].text) {
      out.push({ type: "unchanged", text: after[j].text, level: after[j].level });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      out.push({ type: "removed", text: before[i].text, level: before[i].level });
      i++;
    } else {
      out.push({ type: "added", text: after[j].text, level: after[j].level });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "removed", text: before[i].text, level: before[i].level });
    i++;
  }
  while (j < m) {
    out.push({ type: "added", text: after[j].text, level: after[j].level });
    j++;
  }
  return out;
}

/** Convenience: diff two raw TipTap documents. */
export function diffDocuments(
  before: unknown,
  after: unknown
): DiffLine[] | null {
  return diffBlocks(extractBlocks(before), extractBlocks(after));
}

/**
 * Drop long stretches of unchanged text, keeping `context` blocks either side
 * of each change.
 *
 * A generated document is mostly unchanged by design — that is what makes
 * incremental updates worth doing — so showing all of it hides the few blocks
 * that matter inside pages of agreement.
 */
export function collapseUnchanged(
  lines: DiffLine[],
  context = 2
): (DiffLine | { type: "gap"; count: number })[] {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.type === "unchanged") return;
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k++
    ) {
      keep.add(k);
    }
  });

  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (skipped) {
        out.push({ type: "gap", count: skipped });
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped) out.push({ type: "gap", count: skipped });
  return out;
}

/** Counts for the header line: "+3 −1". */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.type === "added").length,
    removed: lines.filter((l) => l.type === "removed").length,
  };
}
