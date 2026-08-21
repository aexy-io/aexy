import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketsPage from "@/app/(app)/service-desk/tickets/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  /** Every query the page asked the list for, in order. */
  queries: [] as Record<string, unknown>[],
  total: 120,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
  useServiceDeskTickets: (query: Record<string, unknown>) => {
    mocks.queries.push(query);
    return { data: [], isLoading: false };
  },
  useServiceDeskTicketCount: () => ({ data: { total: mocks.total } }),
  useServiceDeskSettings: () => ({ data: { scope: "all", can_manage: true, terminology: {} } }),
  useServiceDeskTaxonomy: () => ({
    stakeholders: [{ slug: "kam", position: 0, semantics: "internal" }],
    requestTypes: [{ slug: "claims", is_default: false }],
    openStakeholders: [],
    closedSlug: "closed",
    stakeholderLabel: (slug: string) => slug,
    requestTypeLabel: (slug: string) => slug,
    isLoading: false,
    isConfigured: true,
  }),
  useProducts: () => ({ data: [{ id: "prod-1", name: "Motor" }] }),
  useAccounts: () => ({ data: [{ id: "acct-1", name: "Acme" }] }),
  useServiceDeskMutations: () => ({ createManual: { mutateAsync: vi.fn() } }),
}));

/**
 * The filter bar is what turns the ticket list into a report, and two of its
 * behaviours are easy to get wrong in ways nobody notices until a KAM is staring
 * at an empty table:
 *
 *  - a date typed as an end date has to include that whole day, and
 *  - changing a filter has to return to page one.
 */
describe("Service Desk ticket filters", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = () => {
    act(() => {
      root.render(<ServiceDeskTicketsPage />);
    });
  };
  const lastQuery = () => mocks.queries[mocks.queries.length - 1];
  /** The rarely-used filters sit behind a disclosure now. */
  const openMoreFilters = () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("filters.more"),
    )!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };
  const select = (label: string) =>
    Array.from(container.querySelectorAll("select")).find(
      (el) => el.previousElementSibling?.textContent === label,
    ) as HTMLSelectElement;
  const change = (el: HTMLElement, value: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLSelectElement
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  beforeEach(() => {
    mocks.queries = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for the first page with no filters until one is chosen", () => {
    render();

    expect(lastQuery()).toMatchObject({ limit: 50, offset: 0 });
    expect(lastQuery().account_id).toBeUndefined();
  });

  it("waits for a pause before asking for what is being typed", () => {
    vi.useFakeTimers();
    render();
    const box = container.querySelector('input[type="search"]') as HTMLInputElement;
    const before = mocks.queries.length;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      // Four keystrokes in quick succession: one query, not four.
      for (const value of ["S", "SS", "SSO", "SSO "]) {
        setter.call(box, value);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(mocks.queries.slice(before).some((q) => q.q !== undefined)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Trimmed: the trailing space was typing, not part of the term.
    expect(lastQuery().q).toBe("SSO");
    vi.useRealTimers();
  });

  it("drops the term from the query when the box is emptied", () => {
    vi.useFakeTimers();
    render();
    const box = container.querySelector('input[type="search"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setter.call(box, "SSO");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(400));
    expect(lastQuery().q).toBe("SSO");

    act(() => {
      setter.call(box, "");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(400));
    // Absent, not empty: an empty string would be sent as `q=` and read by the
    // server as a term that matches nothing.
    expect("q" in lastQuery()).toBe(false);
    vi.useRealTimers();
  });

  it("passes a chosen account through to the query", () => {
    render();
    openMoreFilters();

    change(select("table.account"), "acct-1");

    expect(lastQuery().account_id).toBe("acct-1");
  });

  it("returns to the first page when a filter changes", () => {
    render();
    openMoreFilters();

    const next = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "filters.next",
    )!;
    act(() => next.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(lastQuery().offset).toBe(50);

    // Staying on page 2 of a set that now has one page shows an empty table,
    // which reads as "no results" rather than "wrong page".
    change(select("table.account"), "acct-1");

    expect(lastQuery().offset).toBe(0);
  });

  it("clears every filter at once", () => {
    render();
    openMoreFilters();
    change(select("table.account"), "acct-1");

    const clear = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("filters.clear"),
    )!;
    act(() => clear.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(lastQuery().account_id).toBeUndefined();
    expect(lastQuery().offset).toBe(0);
  });
});
