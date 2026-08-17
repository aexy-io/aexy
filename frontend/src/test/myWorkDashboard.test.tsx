import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MyWorkQueueWidget } from "@/components/dashboard/widgets/MyWorkQueueWidget";
import { MyWorkStatsWidget } from "@/components/dashboard/widgets/MyWorkStatsWidget";
import { useMyWorkStore } from "@/stores/myWorkStore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  hasTicketAccess: true,
  hasServiceDeskAccess: true,
  myWork: [] as unknown[],
  ticketsByWorkspace: {} as Record<string, unknown[]>,
  serviceDeskByWorkspace: {} as Record<string, unknown[]>,
  workspaces: [{ id: "ws-1", name: "Acme" }] as { id: string; name: string }[],
  assignedTaskParams: [] as unknown[],
  ticketListCalls: [] as string[],
  serviceDeskCalls: [] as { workspaceId: string; params: unknown }[],
  switchWorkspace: vi.fn(),
}));

const navMocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: navMocks.redirect,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "dev-1", name: "Ada" } }),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    workspaces: mocks.workspaces,
    currentWorkspace: mocks.workspaces[0] ?? null,
    switchWorkspace: mocks.switchWorkspace,
  }),
}));

vi.mock("@/hooks/useAppAccess", () => ({
  useAppAccess: () => ({
    hasAppAccess: (appId: string) =>
      appId === "service_desk" ? mocks.hasServiceDeskAccess : mocks.hasTicketAccess,
    isLoading: false,
  }),
}));

vi.mock("@/lib/service-desk-api", () => ({
  serviceDeskApi: {
    listTickets: (workspaceId: string, params: unknown) => {
      mocks.serviceDeskCalls.push({ workspaceId, params });
      return Promise.resolve(mocks.serviceDeskByWorkspace[workspaceId] ?? []);
    },
  },
}));

vi.mock("@/lib/api", () => ({
  developerApi: {
    getMyAssignedTasks: (params: unknown) => {
      mocks.assignedTaskParams.push(params);
      return Promise.resolve(mocks.myWork);
    },
  },
  ticketsApi: {
    list: (workspaceId: string) => {
      mocks.ticketListCalls.push(workspaceId);
      return Promise.resolve({
        tickets: mocks.ticketsByWorkspace[workspaceId] ?? [],
        total: 0,
        limit: 100,
        offset: 0,
      });
    },
  },
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
    workspace_id: "ws-1",
    workspace_name: "Acme",
    epic_id: null,
    reference: "[acme:12]",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * The home dashboard's work queue and stat tiles.
 *
 * Four things about this surface are easy to regress and invisible when they do.
 * Bugs and stories belong in a list that claims to show everything assigned to
 * you — an earlier version filtered them out and they only appeared on a page
 * that no longer exists. Every row has to be a real link, because most of them
 * used to resolve to nothing and looked clickable anyway. The list has to be
 * scoped to one workspace, because unscoped is how other workspaces' work ended
 * up in your personal list. And the form-ticket half has to stay gated on the
 * tickets app while the tasks stay visible without it.
 */
describe("My Work dashboard", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  async function render(ui: React.ReactNode) {
    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
    });
    // React Query resolves over several microtask/timer turns before the list
    // has data; one flush lands the fetch, the next lands the re-render.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  beforeEach(() => {
    mocks.hasTicketAccess = true;
    mocks.hasServiceDeskAccess = true;
    mocks.myWork = [];
    mocks.ticketsByWorkspace = {};
    mocks.serviceDeskByWorkspace = {};
    mocks.workspaces = [{ id: "ws-1", name: "Acme" }];
    mocks.assignedTaskParams = [];
    mocks.ticketListCalls = [];
    mocks.serviceDeskCalls = [];
    useMyWorkStore.setState({
      workspaceScopeMode: "current",
      source: "all",
      statusBucket: "all",
      includeDone: false,
      onlyMine: true,
      search: "",
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    queryClient.clear();
  });

  it("lists bugs and stories alongside tasks", async () => {
    mocks.myWork = [
      task(),
      task({ id: "b-1", item_type: "bug", title: "Login 500s on retry" }),
      task({ id: "st-1", item_type: "story", title: "Bulk import", epic_id: "e-1" }),
    ];
    await render(<MyWorkQueueWidget />);

    expect(container.textContent).toContain("Login 500s on retry");
    expect(container.textContent).toContain("Bulk import");
    // The type badge resolves per item rather than labelling everything a task.
    expect(container.textContent).toContain("types.bug");
    expect(container.textContent).toContain("types.story");
  });

  it("gives every row a link, including bugs and stories", async () => {
    mocks.myWork = [
      task(),
      task({ id: "b-1", item_type: "bug", title: "Bug", project_id: "p-9" }),
      task({ id: "st-1", item_type: "story", title: "Story", epic_id: "e-7" }),
    ];
    await render(<MyWorkQueueWidget />);

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toContain("/sprints?task=t-1");
    expect(hrefs).toContain("/sprints/p-9/bugs?bug=b-1");
    expect(hrefs).toContain("/sprints/epics/e-7");
  });

  it("scopes work to the current workspace by default", async () => {
    await render(<MyWorkQueueWidget />);

    expect(mocks.assignedTaskParams).toContainEqual(
      expect.objectContaining({ workspace_id: "ws-1" })
    );
  });

  it("asks for every workspace when the scope is 'all'", async () => {
    mocks.workspaces = [
      { id: "ws-1", name: "Acme" },
      { id: "ws-2", name: "Globex" },
    ];
    useMyWorkStore.setState({ workspaceScopeMode: "all" });
    await render(<MyWorkQueueWidget />);

    // No workspace_id at all — the endpoint's unscoped mode is what "all" means.
    const params = mocks.assignedTaskParams.at(-1) as Record<string, unknown>;
    expect(params.workspace_id).toBeUndefined();
    // Tickets are listed per workspace, so every workspace gets its own request.
    expect(mocks.ticketListCalls).toEqual(
      expect.arrayContaining(["ws-1", "ws-2"])
    );
  });

  it("follows the workspace switcher instead of pinning the last choice", async () => {
    // The scope persists across visits. Persisting the workspace *id* would
    // leave the list showing whichever workspace was picked here last, even
    // after switching workspace in the header — the exact mismatch the filter
    // exists to end.
    mocks.workspaces = [{ id: "ws-2", name: "Globex" }];
    useMyWorkStore.setState({ workspaceScopeMode: "current" });
    await render(<MyWorkQueueWidget />);

    const params = mocks.assignedTaskParams.at(-1) as Record<string, unknown>;
    expect(params.workspace_id).toBe("ws-2");

    // Picking a specific workspace stores the mode, never the id — an id here
    // is what would go stale on the next switch.
    useMyWorkStore.getState().setWorkspaceScope("ws-9");
    expect(useMyWorkStore.getState().workspaceScopeMode).toBe("current");
  });

  it("filters the queue when a stat tile is pressed", async () => {
    mocks.myWork = [
      task({ id: "t-1", title: "Running now", status: "in_progress" }),
      task({ id: "t-2", title: "Not started", status: "todo" }),
    ];
    await render(
      <>
        <MyWorkStatsWidget />
        <MyWorkQueueWidget />
      </>
    );

    expect(container.textContent).toContain("Not started");

    const tile = container.querySelector<HTMLButtonElement>(
      '[data-testid="my-work-stat-in_progress"]'
    );
    expect(tile).not.toBeNull();
    await act(async () => tile!.click());

    expect(container.textContent).toContain("Running now");
    expect(container.textContent).not.toContain("Not started");
    expect(tile!.getAttribute("aria-pressed")).toBe("true");

    // Pressing the active tile again clears the filter rather than latching it.
    await act(async () => tile!.click());
    expect(container.textContent).toContain("Not started");
  });

  it("lists the service desk tickets assigned to the caller", async () => {
    mocks.serviceDeskByWorkspace = {
      "ws-1": [
        {
          id: "sd-row-1",
          ticket_id: "tkt-77",
          display_id: "SD-77",
          subject: "Invoice mismatch on renewal",
          requester_name: "Jo Customer",
          account_name: "Initech",
          status: "open",
          created_at: "2026-08-04T00:00:00Z",
        },
      ],
    };
    await render(<MyWorkQueueWidget />);

    expect(container.textContent).toContain("Invoice mismatch on renewal");
    // The detail route is keyed by the generic ticket id, not the desk row's.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toContain("/service-desk/tickets/tkt-77");

    // Always the caller's own queue — never the whole desk scope, which for a
    // KAM is an account's entire traffic rather than a personal list.
    expect(mocks.serviceDeskCalls).toContainEqual({
      workspaceId: "ws-1",
      params: expect.objectContaining({ assigned_to_me: true }),
    });
  });

  it("keeps the desk out for a caller without service desk access", async () => {
    mocks.hasServiceDeskAccess = false;
    mocks.serviceDeskByWorkspace = {
      "ws-1": [
        {
          id: "sd-row-1",
          ticket_id: "tkt-77",
          display_id: "SD-77",
          subject: "Should not appear",
          status: "open",
          created_at: "2026-08-04T00:00:00Z",
        },
      ],
    };
    await render(<MyWorkQueueWidget />);

    expect(container.textContent).not.toContain("Should not appear");
    expect(mocks.serviceDeskCalls).toHaveLength(0);
    expect(container.querySelector('[data-testid="work-source-service_desk"]')).toBeNull();
  });

  it("the desk source excludes tasks and form tickets", async () => {
    mocks.myWork = [task({ title: "A task" })];
    mocks.ticketsByWorkspace = {
      "ws-1": [
        {
          id: "tk-1",
          ticket_number: 41,
          submitter_name: "A form ticket",
          status: "new",
          created_at: "2026-08-02T00:00:00Z",
          sla_breached: false,
        },
      ],
    };
    mocks.serviceDeskByWorkspace = {
      "ws-1": [
        {
          id: "sd-row-1",
          ticket_id: "tkt-77",
          display_id: "SD-77",
          subject: "A desk ticket",
          status: "open",
          created_at: "2026-08-04T00:00:00Z",
        },
      ],
    };
    useMyWorkStore.setState({ source: "service_desk" });
    await render(<MyWorkQueueWidget />);

    expect(container.textContent).toContain("A desk ticket");
    expect(container.textContent).not.toContain("A task");
    expect(container.textContent).not.toContain("A form ticket");
  });

  it("offers the ticket source when the caller has the tickets app", async () => {
    await render(<MyWorkQueueWidget />);
    expect(container.querySelector('[data-testid="work-source-tickets"]')).not.toBeNull();
  });

  it("hides tickets from a caller without ticket access but keeps their tasks", async () => {
    mocks.hasTicketAccess = false;
    mocks.myWork = [task({ title: "Still mine" })];
    mocks.ticketsByWorkspace = {
      "ws-1": [
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
      ],
    };
    await render(<MyWorkQueueWidget />);

    expect(container.querySelector('[data-testid="work-source-tickets"]')).toBeNull();
    expect(container.textContent).toContain("Still mine");
    expect(container.textContent).not.toContain("Should not appear");
    expect(mocks.ticketListCalls).toHaveLength(0);
  });

  /**
   * /my-work and /tickets are linked from the command palette, the `t`
   * shortcut, the app header and dashboard widgets, and are likely bookmarked.
   * Both must keep landing people on the list, which is now the home dashboard.
   */
  it("redirects the old routes to the home dashboard", async () => {
    navMocks.redirect.mockClear();
    const { default: MyWorkPage } = await import("@/app/(app)/my-work/page");
    MyWorkPage();
    expect(navMocks.redirect).toHaveBeenCalledWith("/dashboard");

    navMocks.redirect.mockClear();
    const { default: TicketsPage } = await import("@/app/(app)/tickets/page");
    TicketsPage();
    // Straight to the destination rather than hopping through /my-work.
    expect(navMocks.redirect).toHaveBeenCalledWith("/dashboard");
  });
});
