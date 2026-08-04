import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketDetailPage from "@/app/(app)/service-desk/tickets/[ticketId]/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  split: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ ticketId: "primary-1" }),
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

// The signed-in user is the assigned KAM, which is what grants write authority
// and therefore makes the split panel render at all.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "kam-1" } }),
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useServiceDeskTicket: () => ({
    isLoading: false,
    data: {
      id: "sd-primary-1",
      ticket_id: "primary-1",
      workspace_id: "workspace-1",
      ticket_number: 1,
      display_id: "BSD-1",
      subject: "Combined request",
      requester_email: "requester@example.com",
      requester_name: "Requester",
      status: "new",
      product_id: null,
      account_id: null,
      partner_name: null,
      vendor_id: null,
      assigned_owner_id: "kam-1",
      request_type: "query",
      pending_with: "kam",
      origin: "email",
      needs_triage: true,
      ai_confidence: 0.91,
      created_at: "2026-08-01T00:00:00Z",
      body: "Please handle both requests",
      linked_task_id: null,
      detected_issues: [
        {
          summary: "Keep the policy query here",
          request_type: "query",
          lob: null,
          confidence: 0.91,
          split_reason: null,
        },
        {
          summary: "Investigate claim C-9",
          request_type: "claims",
          lob: "GMC/GHI",
          confidence: 0.88,
          split_reason: "Separate claims workflow",
        },
        {
          summary: "Already-created payout child",
          request_type: "payout",
          lob: null,
          confidence: 0.86,
          split_reason: "Separate finance workflow",
        },
      ],
      split_done_indexes: [3],
      segments: [],
      correspondence: [],
      // Left empty on purpose: with no recipients the compose card does not
      // render, so the checkboxes counted below are only the issue checkboxes.
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
  useServiceDeskMutations: () => ({
    splitDetectedIssues: {
      mutate: mocks.split,
      isPending: false,
      isError: false,
      data: undefined,
    },
    changePendingWith: { mutateAsync: vi.fn(), isPending: false },
    convertToTask: { mutate: vi.fn(), isPending: false },
    updateTicket: { mutateAsync: vi.fn(), isPending: false, isError: false },
    emailStakeholder: { mutateAsync: vi.fn(), isPending: false, isError: false },
  }),
  useServiceDeskSettings: () => ({ data: { can_manage: false } }),
  useLobs: () => ({ data: [] }),
  usePartners: () => ({ data: [] }),
}));

describe("Service Desk detected issues panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.split.mockReset();
    mocks.push.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the primary and consumed indexes disabled and submits selected indexes", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0].disabled).toBe(true);
    expect(checkboxes[1].disabled).toBe(false);
    expect(checkboxes[2].disabled).toBe(true);

    await act(async () => checkboxes[1].click());
    const splitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "detail.splitIntoTickets",
    );
    expect(splitButton).toBeDefined();
    await act(async () => splitButton!.click());

    expect(mocks.split).toHaveBeenCalledTimes(1);
    expect(mocks.split.mock.calls[0][0]).toEqual({
      id: "primary-1",
      issue_indexes: [2],
    });
  });
});
