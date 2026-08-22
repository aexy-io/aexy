/**
 * Kanban columns flex; they do not carry a hard pixel width.
 *
 * Four boards each sized their columns with a literal `w-[280px]` /
 * `w-[300px]` / `w-[320px]`. A fixed column times a column count the board
 * does not control is a width the container almost never has, so the last
 * column was permanently sliced — 400px of the Planning board, 464px of the
 * hiring pipeline and 916px of the CRM pipeline were off-screen at a 1600px
 * viewport. `src/lib/boardLayout.ts` is now the single width contract; these
 * tests keep the literals from creeping back.
 *
 * The last test is the one that caught a live bug. Tailwind's `content` globs
 * listed only `pages`, `components` and `app` — so an arbitrary value written
 * in `src/lib` was never compiled, and `min-w-[248px]` silently did nothing.
 * `lib/statusColors.ts` ("single source of truth for all status colors") has
 * the same exposure: its classes render today only because some component
 * happens to spell them inline too.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");

/** Every file that renders a kanban column. */
const BOARDS = [
  "src/components/planning/WorkspaceTasksTab.tsx",
  "src/components/crm/KanbanColumn.tsx",
  "src/components/crm/KanbanBoard.tsx",
  "src/app/(app)/sprints/[projectId]/board/page.tsx",
  "src/app/(app)/hiring/candidates/page.tsx",
  "src/app/(app)/sprints/[projectId]/[sprintId]/page.tsx",
];

describe("kanban column width", () => {
  it("no board hard-codes a column width", () => {
    // 240–400px is the kanban-column range. Narrower is a badge or an icon
    // rail; wider is a panel. A collapsed rail (`w-[60px]`) is fine.
    const offenders: string[] = [];
    for (const file of BOARDS) {
      for (const m of src(file).matchAll(/(?<![a-z-])w-\[(\d+)px\]/g)) {
        const px = Number(m[1]);
        if (px >= 240 && px <= 400) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      "use BOARD_COLUMN / BOARD_COLUMN_STACKING from @/lib/boardLayout"
    ).toEqual([]);
  });

  it("every board takes its width from the shared contract", () => {
    const missing = BOARDS.filter(
      // KanbanBoard renders the row, KanbanColumn the column — only the ones
      // that draw a column need the import, so accept either here and let the
      // test above catch a board that drew one without it.
      (f) => !/@\/lib\/boardLayout/.test(src(f)) && /BOARD_COLUMN/.test(src(f))
    );
    expect(missing).toEqual([]);
    expect(
      BOARDS.filter((f) => /@\/lib\/boardLayout/.test(src(f))).length
    ).toBeGreaterThanOrEqual(5);
  });

  it("the contract is a floor and a ceiling, not a fixed width", () => {
    const layout = src("src/lib/boardLayout.ts");
    for (const name of ["BOARD_COLUMN", "BOARD_COLUMN_STACKING"]) {
      const value = layout.match(new RegExp(`${name}\\b[^=]*=\\s*([\\s\\S]*?);`))?.[1] ?? "";
      expect(value, `${name} must grow`).toMatch(/flex-1/);
      expect(value, `${name} needs a readable floor`).toMatch(/min-w-\[\d+px\]/);
      expect(value, `${name} needs a ceiling`).toMatch(/max-w-\[\d+px\]/);
    }
  });

  it("tailwind scans the directories that hold shared class strings", () => {
    // Without these globs the arbitrary values above compile to nothing and
    // the columns silently fall back to `flex-1` with no minimum.
    const config = src("tailwind.config.ts");
    for (const dir of ["lib", "config", "hooks"]) {
      expect(
        config,
        `add ./src/${dir}/** to tailwind content — classes declared there are never generated`
      ).toMatch(new RegExp(`\\./src/${dir}/\\*\\*`));
    }
  });
});
