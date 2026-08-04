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
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useServiceDeskTickets: () => ({ data: mocks.tickets, isLoading: false }),
  useServiceDeskSettings: () => ({ data: { scope: mocks.scope, can_manage: false } }),
  useLobs: () => ({ data: [] }),
  usePartners: () => ({ data: [] }),
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
