/**
 * Attachments on a Service Desk ticket detail page.
 *
 * They used to be filenames rendered as plain text: a KAM could see that a
 * claim register had arrived and had no way to open it, so the ticket could only
 * be worked from the mailbox it came from. What matters here is that the button
 * asks for the file by *position* — two replies can attach files with the same
 * name — and that a file the desk has no handle for offers no button at all,
 * because the download would only ever come back as an error.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketDetailPage from "@/app/(app)/service-desk/tickets/[ticketId]/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ ticketId: "ticket-1" }),
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "workspace-1" } }),
  useWorkspaceMembers: () => ({ members: [] }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ projects: [] }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "kam-1" } }),
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useServiceDeskTicket: () => ({
    isLoading: false,
    data: {
      id: "sd-ticket-1",
      ticket_id: "ticket-1",
      workspace_id: "workspace-1",
      ticket_number: 12,
      display_id: "SD-12",
      subject: "Testing - auto assignment",
      requester_email: "chandan.t@bimaplan.co",
      requester_name: "Chandan Tyagi",
      status: "new",
      product_id: null,
      account_id: null,
      account_name: null,
      vendor_id: null,
      assigned_owner_id: "kam-1",
      request_type: "query",
      pending_with: "kam",
      can_edit: true,
      can_send_email: true,
      origin: "email",
      needs_triage: false,
      ai_confidence: null,
      created_at: "2026-08-12T00:00:00Z",
      body: "It should assign to paramita as per the rule",
      linked_task_id: null,
      detected_issues: [],
      split_done_indexes: [],
      segments: [],
      correspondence: [],
      email_recipients: [],
      attachments: [
        {
          index: 0,
          filename: "Tata AI Loader LOT 5 AUG 2026.xlsx",
          content_type: "application/vnd.ms-excel",
          size_bytes: 20480,
          can_forward: true,
        },
        // Arrived before the desk kept provider handles, so there are no bytes
        // to fetch — for forwarding or for downloading.
        {
          index: 1,
          filename: "older-register.pdf",
          content_type: "application/pdf",
          size_bytes: 4096,
          can_forward: false,
        },
      ],
      tat: {
        overall_seconds: 0,
        overall_days: 0.15,
        current_pending_with: "kam",
        current_stage_seconds: 0,
        current_stage_days: 0.38,
        breach_level: "green",
        stakeholder_seconds: {},
      },
    },
  }),
  useServiceDeskMutations: () => ({
    splitDetectedIssues: { mutate: vi.fn(), isPending: false, isError: false, data: undefined },
    changePendingWith: { mutateAsync: vi.fn(), isPending: false },
    convertToTask: { mutate: vi.fn(), isPending: false },
    updateTicket: { mutateAsync: vi.fn(), isPending: false, isError: false },
    emailStakeholder: { mutateAsync: vi.fn(), isPending: false, isError: false },
    downloadAttachment: { mutate: mocks.download, isPending: false, variables: undefined },
  }),
  useServiceDeskSettings: () => ({ data: { can_manage: false } }),
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
}));

describe("Service Desk ticket attachments", () => {
  let container: HTMLDivElement;
  let root: Root;

  const downloadButtons = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((button) =>
      (button.getAttribute("aria-label") ?? "").startsWith("detail.download"),
    );

  beforeEach(() => {
    mocks.download.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("downloads a file by its index, not its name", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    // Only the file with a provider handle gets a button.
    const buttons = downloadButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe(
      "detail.download Tata AI Loader LOT 5 AUG 2026.xlsx",
    );

    await act(async () => buttons[0].click());

    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download.mock.calls[0][0]).toEqual({
      id: "ticket-1",
      index: 0,
      filename: "Tata AI Loader LOT 5 AUG 2026.xlsx",
    });
  });

  it("says so rather than offering a download it cannot honour", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    // The unfetchable file is still listed — it did arrive on the ticket, and
    // hiding it would misrepresent the request — but it is labelled instead.
    expect(container.textContent).toContain("older-register.pdf");
    expect(container.textContent).toContain("detail.attachmentUnavailable");
    expect(downloadButtons()).toHaveLength(1);
  });

  it("shows every section of the ticket, both columns included", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    // The redesign moved these into a rail beside the request rather than a
    // single column below it; none of them may go missing in the move.
    for (const section of [
      "detail.request",
      "detail.attachments",
      "detail.details",
      "detail.turnaround",
      "detail.overallTat",
      "detail.stakeholderTat",
      "detail.actions",
      "detail.changeTo",
      "detail.convertToTask",
      "detail.emailStakeholder",
      "detail.timeline",
    ]) {
      expect(container.textContent, section).toContain(section);
    }
  });
});
