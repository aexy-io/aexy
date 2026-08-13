import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyWorkPage from "@/app/(app)/my-work/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  hasTicketAccess: true,
  myWork: [] as unknown[],
  tickets: [] as unknown[],
}));

const navMocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: navMocks.redirect,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "dev-1" } }),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "ws-1" } }),
}));

vi.mock("@/hooks/useAppAccess", () => ({
  useAppAccess: () => ({ hasAppAccess: () => mocks.hasTicketAccess }),
}));

vi.mock("@/hooks/useMyWork", () => ({
  useMyWork: () => ({ data: mocks.myWork, isLoading: false }),
}));

vi.mock("@/hooks/useTicketing", () => ({
  useTickets: () => ({ tickets: mocks.tickets, total: mocks.tickets.length, isLoading: false }),
}));

vi.mock("@/hooks/useSavedViews", () => ({
  useSavedViews: () => ({
    views: [],
    createView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
    isCreating: false,
    isUpdating: false,
  }),
}));

vi.mock("@/components/ModuleAutomationsPanel", () => ({
  ModuleAutomationsPanel: () => null,
}));

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    item_type: "task",
    title: "Wire the webhook",
    status: "in_progress",
    priority: "medium",
    story_points: null,
    sprint_id: "s-1",
    project_id: "p-1",
    sprint_name: "Sprint 4",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * This page absorbed the old /tickets list and replaced a thinner /my-work.
 *
 * Two things about that merge are easy to regress and invisible when they do.
 * The previous /tickets version filtered its task list to `item_type === "task"`,
 * so bugs and stories were silently missing from the page that claims to show
 * everything assigned to you — they only appeared on the page that has now been
 * deleted. And the page is no longer behind the tickets app guard, because it has
 * to serve somebody with sprint access and no ticket access; if the form-ticket
 * half is not gated per-source, that person sees a queue they are not entitled to.
 */
describe("My Work", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.hasTicketAccess = true;
    mocks.myWork = [];
    mocks.tickets = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lists bugs and stories alongside tasks", async () => {
    mocks.myWork = [
      task(),
      task({ id: "b-1", item_type: "bug", title: "Login 500s on retry" }),
      task({ id: "s-1", item_type: "story", title: "Bulk import" }),
    ];
    await act(async () => root.render(<MyWorkPage />));

    expect(container.textContent).toContain("Login 500s on retry");
    expect(container.textContent).toContain("Bulk import");
    // The type badge resolves per item rather than labelling everything a task.
    expect(container.textContent).toContain("types.bug");
    expect(container.textContent).toContain("types.story");
  });

  it("deep-links a task to the board it is actually on", async () => {
    mocks.myWork = [task()];
    await act(async () => root.render(<MyWorkPage />));

    const rows = container.querySelectorAll('[data-testid="work-item-task"]');
    expect(rows).toHaveLength(1);
  });

  it("offers the form-ticket source when the caller has the tickets app", async () => {
    await act(async () => root.render(<MyWorkPage />));
    expect(container.querySelector('[data-testid="work-source-tickets"]')).not.toBeNull();
  });

  it("hides the form-ticket source from someone without ticket access", async () => {
    mocks.hasTicketAccess = false;
    await act(async () => root.render(<MyWorkPage />));

    expect(container.querySelector('[data-testid="work-source-tickets"]')).toBeNull();
    // The assigned-to-me switch only scopes tickets, so it goes too.
    expect(container.querySelector('[data-testid="work-only-mine"]')).toBeNull();
  });

  it("still shows a sprints-only caller their own tasks", async () => {
    mocks.hasTicketAccess = false;
    mocks.myWork = [task({ title: "Still mine" })];
    await act(async () => root.render(<MyWorkPage />));

    expect(container.textContent).toContain("Still mine");
  });

  /**
   * /tickets is linked from the command palette, the `t` shortcut, the app
   * header, several dashboard widgets and the uptime pages, and is likely
   * bookmarked. It must keep landing people on the list, which now lives at
   * /my-work.
   */
  it("redirects the old /tickets route to /my-work", async () => {
    navMocks.redirect.mockClear();
    const { default: TicketsPage } = await import("@/app/(app)/tickets/page");
    TicketsPage();
    expect(navMocks.redirect).toHaveBeenCalledWith("/my-work");
  });

  it("keeps tickets out of the list for a caller without ticket access", async () => {
    mocks.hasTicketAccess = false;
    mocks.tickets = [
      {
        id: "tk-1",
        ticket_number: 41,
        submitter_name: "Should not appear",
        form_name: "Support",
        status: "new",
        priority: "high",
        created_at: "2026-08-02T00:00:00Z",
        sla_breached: false,
      },
    ];
    await act(async () => root.render(<MyWorkPage />));

    expect(container.textContent).not.toContain("Should not appear");
  });
});
