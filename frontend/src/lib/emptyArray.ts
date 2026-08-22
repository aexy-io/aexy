/**
 * The empty array a hook hands back when its query has no data yet.
 *
 * `items: data ?? []` reads as a harmless default and is a **new object
 * identity on every render** — while the query is in flight, while it is
 * disabled, and forever if it errors. Every `useMemo`, `useEffect` and
 * `useCallback` downstream that lists it as a dependency is invalidated on
 * each render.
 *
 * Usually that only costs renders. It becomes a hang when the chain ends in a
 * component that mirrors the value into state:
 *
 *   useTaskStatuses  `statuses: statuses || []`
 *     → useProjectBoard  projectStatusSlugs → tasksByStatus
 *       → backlog page   backlogItems → filteredItems
 *         → useEffect(() => setOrderedItems(filteredItems), [filteredItems])
 *
 * which is "Maximum update depth exceeded" on /sprints/[projectId]/backlog,
 * for as long as the page was open. One `|| []` at the top, four `useMemo`s
 * of amplification, and a setState at the bottom.
 *
 * Sharing one frozen array across every hook removes the whole class. It is
 * frozen because it is shared: a `push` into what used to be a per-render
 * throwaway would now be visible everywhere, and a `TypeError` naming this
 * file is a better outcome than silent cross-hook corruption. Nothing should
 * be mutating a hook's return value anyway — when the query *does* have data
 * that array is react-query's cache entry.
 *
 * Typed `never[]` so `data ?? EMPTY_ARRAY` keeps the exact element type:
 * `never[]` is a subtype of every `T[]`, and TypeScript's subtype reduction
 * collapses the union back to `T[]`.
 *
 * `renderLoop.test.ts` keeps the literals from coming back.
 */
export const EMPTY_ARRAY: never[] = Object.freeze([]) as never[];
