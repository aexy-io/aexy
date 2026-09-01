import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketsPage from "@/app/(app)/service-desk/tickets/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scope: "all" as "all" | "assigned" | "function" | "none",
  tickets: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "ws-1" } }),
  useWorkspaceMembers: () => ({ members: [], isLoading: false }),
}));

// Added with the log-dialog's optional "raise the task now" fields: the page
// now reads projects too, and the real hook needs a QueryClient these tests
// deliberately do without.
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ projects: [{ id: "proj-1", name: "Platform" }], isLoading: false }),
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useVendors: () => ({ data: [] }),
  useServiceDeskTickets: () => ({ data: mocks.tickets, isLoading: false }),
  useServiceDeskTicketCount: () => ({ data: { total: mocks.tickets.length } }),
  useServiceDeskSettings: () => ({ data: { scope: mocks.scope, can_manage: false } }),
  useServiceDeskTaxonomy: () => ({
    stakeholders: [],
    requestTypes: [],
    openStakeholders: [],
    closedSlug: null,
    stakeholderLabel: (slug: string | null | undefined) => slug ?? "—",
    requestTypeLabel: (slug: string | null | undefined) => slug ?? "—",
    isLoading: false,
    isConfigured: true,
  }),
  useProducts: () => ({ data: [] }),
  useAccounts: () => ({ data: [] }),
  useServiceDeskMutations: () => ({ createManual: { mutateAsync: vi.fn() } }),
}));

/** The empty ticket list means something different to each role, and the page is
 *  the only place that difference is ever explained. The server does the row
 *  filtering either way — this only checks the page doesn't tell a KAM the desk
 *  is quiet when it is merely none of their business. */
describe("Service Desk tickets empty state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.tickets = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("tells an assigned-only KAM that other tickets have their own owners", async () => {
    mocks.scope = "assigned";
    await act(async () => root.render(<ServiceDeskTicketsPage />));
    expect(container.textContent).toContain("assignedOnly");
    expect(container.textContent).not.toContain("noDepartment");
  });

  it("still distinguishes someone who is in no department at all", async () => {
    mocks.scope = "none";
    await act(async () => root.render(<ServiceDeskTicketsPage />));
    expect(container.textContent).toContain("noDepartment");
  });

  it("falls back to the plain wording for a full-view caller", async () => {
    mocks.scope = "all";
    await act(async () => root.render(<ServiceDeskTicketsPage />));
    expect(container.textContent).toContain("dashboard.empty");
    expect(container.textContent).not.toContain("assignedOnly");
  });
});
