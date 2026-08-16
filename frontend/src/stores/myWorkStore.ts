/**
 * My Work dashboard filter state.
 *
 * The home dashboard is assembled from independent widgets — the stat tiles and
 * the queue are separate, movable, hideable things — but they describe one list.
 * A tile that says "3 in progress" has to filter the queue below it, and the
 * workspace scope has to mean the same thing to every widget on the page. That
 * shared state can't live in either widget, so it lives here.
 *
 * Scope persists as a *mode*, not as a workspace id: "the workspace I'm in" or
 * "all of them". Storing the id would pin the dashboard to whichever workspace
 * you last picked here, so switching workspace in the header would leave the
 * list showing the old one — the same mismatch this filter exists to end. The
 * status filter deliberately does not persist: landing on your dashboard to
 * find it silently filtered from last week is how work goes missing.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A workspace id, or every workspace at once. */
export type WorkspaceScope = "all" | string;

/** Persisted form of the scope: follow the current workspace, or span them all. */
export type WorkspaceScopeMode = "current" | "all";

/**
 * Which tracker a row came from.
 *
 * "tickets" is the form-ticket queue; "service_desk" is the desk, a separate
 * app with its own permission — the two share a database table but not a
 * meaning, and somebody usually works one of them, not both.
 */
export type WorkSource = "all" | "tasks" | "tickets" | "service_desk";

/**
 * The bucket a stat tile filters to. Buckets rather than raw statuses because
 * tasks, bugs, stories and tickets each have their own status vocabulary — "to
 * do" is `todo`, `backlog`, `new` and `open` depending on which tracker you ask.
 */
export type StatusBucket = "all" | "in_progress" | "todo" | "sla_breached";

interface MyWorkState {
  /** "current" follows the workspace switcher; "all" spans every workspace. */
  workspaceScopeMode: WorkspaceScopeMode;
  source: WorkSource;
  statusBucket: StatusBucket;
  includeDone: boolean;
  /**
   * Whether the ticket half of the list is scoped to the viewer.
   *
   * On by default — this is a dashboard about your own work. Turning it off
   * gives back the workspace-wide ticket triage queue that the old Form Tickets
   * tab was, which some people do rely on. Tasks, bugs and stories are always
   * yours: their endpoint is assignee-scoped and has nothing else to show.
   */
  onlyMine: boolean;
  search: string;

  /**
   * Takes what the selector emits — "all" or a workspace id — and stores only
   * the mode. Selecting a specific workspace is the caller's cue to switch the
   * app to it, which is what makes "current" resolve there.
   */
  setWorkspaceScope: (scope: WorkspaceScope) => void;
  setSource: (source: WorkSource) => void;
  setOnlyMine: (onlyMine: boolean) => void;
  /** Selecting the active bucket clears it — tiles toggle rather than latch. */
  toggleStatusBucket: (bucket: StatusBucket) => void;
  setIncludeDone: (includeDone: boolean) => void;
  setSearch: (search: string) => void;
}

export const useMyWorkStore = create<MyWorkState>()(
  persist(
    (set) => ({
      workspaceScopeMode: "current",
      source: "all",
      statusBucket: "all",
      includeDone: false,
      onlyMine: true,
      search: "",

      setWorkspaceScope: (scope) =>
        set({ workspaceScopeMode: scope === "all" ? "all" : "current" }),
      setSource: (source) => set({ source }),
      setOnlyMine: (onlyMine) => set({ onlyMine }),
      toggleStatusBucket: (bucket) =>
        set((state) => ({
          statusBucket: state.statusBucket === bucket ? "all" : bucket,
        })),
      setIncludeDone: (includeDone) => set({ includeDone }),
      setSearch: (search) => set({ search }),
    }),
    {
      name: "my-work-filters",
      partialize: (state) => ({ workspaceScopeMode: state.workspaceScopeMode }),
    }
  )
);
