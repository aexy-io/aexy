/**
 * One width contract for every kanban column in the app.
 *
 * Each of the four boards — Planning ▸ All Tasks, the project board, the CRM
 * pipeline and the hiring pipeline — sized its columns with a hard
 * `w-[280px]`/`w-[300px]`/`w-[320px]` and let the row scroll. A fixed column
 * times a column count the board does not control is a width the container
 * almost never has, so the last column was permanently sliced in half:
 *
 *   Planning ▸ All Tasks   5 × 320 = 1648px in 1248px  → 400px hidden
 *   Hiring ▸ Candidates    6 × 280 = 1760px in 1296px  → 464px hidden
 *   CRM ▸ Deals            7 × 300 = 2196px in 1280px  → 916px hidden
 *   Project board          4 × 300 = 1596px in 1344px  → 252px hidden
 *
 * — all measured at a 1600px viewport, i.e. on a screen with room to spare.
 * Worse, the horizontal scrollbar sat *below* the fold on a tall board, so the
 * usual read of a clipped edge ("there is more, scroll for it") was not even
 * available: the board simply looked broken.
 *
 * Columns now flex. They share whatever width the row has, between a floor of
 * 248px and a ceiling of 360px. The floor is where a card still holds its
 * badges on one line and its title on two — it also happens to be what lets a
 * five-status board fit whole on a 1600px screen, which is the common case
 * this was failing. The ceiling stops three statuses on an ultrawide becoming
 * three enormous troughs.
 *
 * The row keeps `overflow-x-auto`, and it still engages — seven CRM stages
 * cannot fit at 1280px at any readable column width. The difference is that
 * the scroll is now the last resort rather than the first: the board uses
 * every pixel it has before hiding anything.
 *
 * `boardColumnWidth.test.ts` asserts no board reintroduces a fixed width.
 */

/** A kanban column in a row that is horizontal at every breakpoint. */
export const BOARD_COLUMN = "min-w-[248px] max-w-[360px] flex-1";

/**
 * The same contract for a board that stacks into one full-width column on
 * phones (Planning ▸ All Tasks), where the row is `flex-col` until `md`.
 */
export const BOARD_COLUMN_STACKING =
  "w-full md:min-w-[248px] md:max-w-[360px] md:flex-1";
