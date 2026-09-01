import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketsPage from "@/app/(app)/service-desk/tickets/page";
import ServiceDeskTicketDetailPage from "@/app/(app)/service-desk/tickets/[ticketId]/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  queries: [] as Record<string, unknown>[],
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  /** What the address bar holds when the list mounts. */
  search: "",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ ticketId: "tkt-1" }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: mocks.back }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "ws-1" } }),
  useWorkspaceMembers: () => ({ members: [], isLoading: false }),
}));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ projects: [], isLoading: false }),
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useVendors: () => ({ data: [] }),
  useServiceDeskTickets: (query: Record<string, unknown>) => {
    mocks.queries.push(query);
    return {
      data: [{
        ticket_id: "tkt-1",
        display_id: "SD-1",
        subject: "Cheque bounced",
        account_name: "Acme",
        request_type: "claims",
        pending_with: "kam",
        status: "new",
        needs_triage: false,
        created_at: "2026-08-01T00:00:00Z",
      }],
      isLoading: false,
    };
  },
  useServiceDeskTicketCount: () => ({ data: { total: 1 } }),
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
  // The detail page gained a "publish to community" card; this file is about the
  // back link above it, so the card just needs its hook to exist.
  useCommunityPublishTargets: () => ({ data: undefined, isLoading: false }),
  useServiceDeskMutations: () => ({
    createManual: { mutateAsync: vi.fn() },
    changePendingWith: { mutateAsync: vi.fn(), isPending: false },
    convertToTask: { mutate: vi.fn(), isPending: false },
    updateTicket: { mutateAsync: vi.fn(), isPending: false, isError: false },
    splitDetectedIssues: { mutate: vi.fn(), isPending: false, isError: false, data: undefined },
    downloadAttachment: { mutateAsync: vi.fn(), isPending: false },
    sendEmail: { mutateAsync: vi.fn(), isPending: false, isError: false },
  }),
  // Enough of a ticket for the detail screen to render its header; this test is
  // about the back link above it, not about anything the body shows.
  useServiceDeskTicket: () => ({
    isLoading: false,
    data: {
      id: "sd-1",
      ticket_id: "tkt-1",
      workspace_id: "ws-1",
      ticket_number: 1,
      display_id: "SD-1",
      subject: "Cheque bounced",
      requester_email: "requester@example.com",
      requester_name: "Requester",
      status: "new",
      product_id: null,
      account_id: null,
      partner_name: null,
      vendor_id: null,
      assigned_owner_id: null,
      request_type: "claims",
      pending_with: "kam",
      can_edit: false,
      can_send_email: false,
      origin: "email",
      needs_triage: false,
      ai_confidence: null,
      created_at: "2026-08-01T00:00:00Z",
      body: "The cheque bounced.",
      linked_task_id: null,
      detected_issues: [],
      split_done_indexes: [],
      segments: [],
      correspondence: [],
      email_recipients: [],
      attachments: [],
      tat: {
        overall_seconds: 0,
        overall_days: 0,
        current_pending_with: "kam",
        current_stage_seconds: 0,
        current_stage_days: 0,
        breach_level: "green",
        stakeholder_seconds: {},
      },
    },
  }),
}));

/**
 * Reading a ticket used to cost you the queue you were reading it from. The
 * list held its search, filters, sort and page in component state alone, and
 * the ticket's back link was a hardcoded push to the dashboard — so every route
 * out of a ticket landed on a screen with the filtering thrown away, and a
 * morning of working a filtered queue meant re-typing it once per ticket.
 *
 * Two things have to hold for that not to come back, and they are independent:
 * the list has to put its state somewhere a navigation cannot erase, and the
 * ticket has to go back to where it was opened from.
 */
describe("Service Desk ticket list, opened and returned to", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (node: React.ReactElement) => {
    act(() => { root.render(node); });
  };
  const lastQuery = () => mocks.queries[mocks.queries.length - 1];

  beforeEach(() => {
    mocks.queries = [];
    mocks.search = "";
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.back.mockClear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/service-desk/tickets");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for exactly the filtered page the address describes", () => {
    mocks.search = "q=cheque&account_id=acct-1&is_open=1&sort=subject&direction=desc&page=3";
    render(<ServiceDeskTicketsPage />);

    expect(lastQuery()).toMatchObject({
      q: "cheque",
      account_id: "acct-1",
      is_open: true,
      sort: "subject",
      direction: "desc",
      // Page 3 of 50 — the pager is one-based, the offset is not. The debounce
      // settling on a term that is already applied must not reset this.
      offset: 100,
    });
  });

  it("opens the filters that arrived in the address, rather than hiding them", () => {
    mocks.search = "account_id=acct-1";
    render(<ServiceDeskTicketsPage />);

    const account = Array.from(container.querySelectorAll("select")).find(
      (el) => el.previousElementSibling?.textContent === "table.account",
    ) as HTMLSelectElement | undefined;
    expect(account?.value).toBe("acct-1");
  });

  it("writes a chosen filter into the address, without stacking history", () => {
    render(<ServiceDeskTicketsPage />);
    const more = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("filters.more"),
    )!;
    act(() => more.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const account = Array.from(container.querySelectorAll("select")).find(
      (el) => el.previousElementSibling?.textContent === "table.account",
    ) as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!
        .call(account, "acct-1");
      account.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mocks.replace).toHaveBeenCalledWith(
      "/service-desk/tickets?account_id=acct-1",
      { scroll: false },
    );
    // `replace`, never `push`: a history entry per filter change would bury the
    // screen the reader actually arrived from.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("takes the back link on a ticket to the filtered list it was opened from", () => {
    window.history.replaceState({}, "", "/service-desk/tickets?q=cheque&account_id=acct-1");
    mocks.search = "q=cheque&account_id=acct-1";
    render(<ServiceDeskTicketsPage />);

    const row = container.querySelector("tbody tr") as HTMLTableRowElement;
    act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.push).toHaveBeenCalledWith("/service-desk/tickets/tkt-1");

    mocks.push.mockClear();
    render(<ServiceDeskTicketDetailPage />);
    const back = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("detail.back"),
    )!;
    act(() => back.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // Not `/service-desk`, which is what it used to be, and not a bare list.
    expect(mocks.push).toHaveBeenCalledWith("/service-desk/tickets?q=cheque&account_id=acct-1");
  });

  it("does not send a ticket opened from elsewhere to a list it never came from", () => {
    // A return address recorded for some other ticket — the operator reached
    // this one from My Work — must not be handed to it.
    sessionStorage.setItem(
      "serviceDesk:returnTo",
      JSON.stringify({ ticketId: "tkt-99", url: "/service-desk/tickets?q=cheque" }),
    );
    render(<ServiceDeskTicketDetailPage />);
    const back = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("detail.back"),
    )!;
    act(() => back.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.push).not.toHaveBeenCalledWith("/service-desk/tickets?q=cheque");
  });
});
