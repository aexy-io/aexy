import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SprintsPage from "@/app/(app)/sprints/page";
import EpicDetailPage from "@/app/(app)/sprints/epics/[epicId]/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: "",
  /** Every filter set the epic list asked the server for, in order. */
  epicQueries: [] as Record<string, unknown>[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
  useParams: () => ({ epicId: "epic-1" }),
  redirect: vi.fn(),
  usePathname: () => "/sprints",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Dev" }, isLoading: false, isAuthenticated: true, logout: vi.fn() }),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    currentWorkspaceId: "ws-1", currentWorkspace: { id: "ws-1" },
    currentWorkspaceLoading: false, hasWorkspaces: true,
  }),
  useWorkspaceMembers: () => ({ members: [], isLoading: false }),
}));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ projects: [], isLoading: false, createProject: vi.fn(), isCreating: false }),
}));

const EPIC = {
  id: "epic-1", workspace_id: "ws-1", key: "EPIC-1", title: "Billing rewrite",
  description: "Move billing off the legacy job", status: "in_progress", color: "#6366F1",
  owner_id: null, owner_name: "Priya", owner_avatar_url: null,
  start_date: "2026-01-01", target_date: "2026-06-01", completed_date: null,
  priority: "high", labels: [], total_tasks: 10, completed_tasks: 4,
  total_story_points: 20, completed_story_points: 8, progress_percentage: 40,
  source_type: "manual", source_id: null,
};

vi.mock("@/hooks/useEpics", () => ({
  useEpics: (_ws: string, options: Record<string, unknown>) => {
    mocks.epicQueries.push(options);
    return { epics: [], isLoading: false, createEpic: vi.fn(), isCreating: false };
  },
  useEpic: () => ({ epic: EPIC, isLoading: false, updateEpic: vi.fn(), isUpdating: false }),
  useEpicDetail: () => ({ epicDetail: { ...EPIC, tasks_by_status: {}, tasks_by_team: {}, recent_completions: 0, tasks: [] }, isLoading: false }),
  useEpicProgress: () => ({ progress: null }),
  useEpicTimeline: () => ({ timeline: null, isLoading: false }),
  useEpicBurndown: () => ({ burndown: null }),
  useEpicTasks: () => ({ addTasks: vi.fn(), removeTask: vi.fn(), isAddingTasks: false, isRemovingTask: false }),
}));
// The Tasks tab pulls in the workspace Kanban, which wants a real QueryClient.
// This file is about the switcher above it, not what any tab renders.
vi.mock("@/components/planning/WorkspaceTasksTab", () => ({
  WorkspaceTasksTab: () => null,
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useQuery: () => ({ data: null, isLoading: false }),
}));

/**
 * Three things went wrong on the way in and out of an epic, and each had its
 * own cause:
 *
 *  - the view switcher was `<button onClick={router.push}>`, so it navigated
 *    but was not a link: cmd-click and open-in-new-tab did nothing at all, and
 *    nothing was prefetched, so a click sat there looking ignored;
 *  - the epic list kept its filters in component state, so coming back from an
 *    epic rebuilt the screen unfiltered; and
 *  - the epic page drew a second copy of the whole app's chrome — logo, nav,
 *    avatar, logout — inside the shell that already provides it.
 */
describe("Planning navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (node: React.ReactElement) => { act(() => { root.render(node); }); };

  beforeEach(() => {
    mocks.search = "";
    mocks.epicQueries = [];
    mocks.push.mockClear();
    mocks.replace.mockClear();
    window.history.replaceState({}, "", "/sprints");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const tabs = () =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Planning views'] a"));

  it("renders the view switcher as real links, not click handlers", () => {
    mocks.search = "tab=epics";
    render(<SprintsPage />);

    // Real hrefs are what make cmd-click, middle-click and "open in new tab"
    // work — none of which a <button> can do.
    expect(tabs().map((a) => a.getAttribute("href"))).toEqual([
      "/sprints",
      "/sprints?tab=epics",
      "/sprints?tab=tasks",
      "/sprints?tab=automations",
    ]);
  });

  it("marks the view in force, and only that one", () => {
    mocks.search = "tab=epics";
    render(<SprintsPage />);

    const current = tabs().filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/sprints?tab=epics");
  });

  it("drops an open task detail when leaving the tab that owns it", () => {
    // `?task=` on any other tab re-arms the redirect to that task's board, which
    // would throw away the view the reader just asked for.
    mocks.search = "tab=tasks&task=t-9";
    render(<SprintsPage />);

    for (const href of tabs().map((a) => a.getAttribute("href") ?? "")) {
      expect(href).not.toContain("task=");
    }
  });

  it("asks the server for the filters the address describes", () => {
    mocks.search = "tab=epics&q=billing&status=in_progress&priority=high";
    render(<SprintsPage />);

    // The unfiltered call behind the status counts is also in this list, so
    // assert that the filtered one was made rather than that it was the only one.
    expect(mocks.epicQueries).toContainEqual({
      search: "billing", status: "in_progress", priority: "high",
    });
  });

  it("writes a status card's filter back to the address", () => {
    mocks.search = "tab=epics";
    render(<SprintsPage />);

    const done = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Done"))!;
    act(() => done.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // `replace`, not `push`: one history entry per filter change would bury the
    // page the reader arrived from.
    expect(mocks.replace).toHaveBeenCalledWith("/sprints?tab=epics&status=done", { scroll: false });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("draws no second app header on an epic", () => {
    render(<EpicDetailPage />);

    expect(container.textContent).toContain("Billing rewrite");
    // The shell already provides all of these. A page that draws its own is
    // showing the reader two of everything.
    expect(container.querySelector("header a[href='/dashboard']")).toBeNull();
    expect(container.querySelector("a[href='/learning']")).toBeNull();
    expect(container.textContent).not.toContain("Aexy");
  });
});
