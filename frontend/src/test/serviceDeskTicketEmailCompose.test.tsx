/**
 * The outbound email card on a Service Desk ticket.
 *
 * The recipient used to be a closed dropdown built from Master Data, which on a
 * ticket whose requester was wrong (or absent) left nobody to write to. It is a
 * text field with the configured addresses as suggestions now, plus Cc — so the
 * two things this covers are that a typed address reaches the mutation, and that
 * Cc is parsed into a list rather than sent as the raw string.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceDeskTicketDetailPage from "@/app/(app)/service-desk/tickets/[ticketId]/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  email: vi.fn(),
  push: vi.fn(),
  // Whether the ticket's mailbox can send at all — flipped per test.
  canSendEmail: true,
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
      ticket_number: 5,
      display_id: "SD-5",
      subject: "Test Ticket",
      requester_email: "requester@example.com",
      requester_name: "Requester",
      status: "new",
      product_id: null,
      account_id: null,
      account_name: null,
      vendor_id: null,
      assigned_owner_id: "kam-1",
      request_type: "query",
      pending_with: "kam",
      can_edit: true,
      can_send_email: mocks.canSendEmail,
      origin: "email",
      needs_triage: false,
      ai_confidence: null,
      created_at: "2026-08-12T00:00:00Z",
      body: "This is Test Ticket",
      linked_task_id: null,
      detected_issues: [],
      split_done_indexes: [],
      segments: [],
      correspondence: [],
      email_recipients: [
        { email: "requester@example.com", label: "Requester", stage: null },
      ],
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
    splitDetectedIssues: { mutate: vi.fn(), isPending: false, isError: false, data: undefined },
    changePendingWith: { mutateAsync: vi.fn(), isPending: false },
    convertToTask: { mutate: vi.fn(), isPending: false },
    updateTicket: { mutateAsync: vi.fn(), isPending: false, isError: false },
    emailStakeholder: { mutateAsync: mocks.email, isPending: false, isError: false },
  }),
  useServiceDeskSettings: () => ({ data: { can_manage: false } }),
  useServiceDeskTaxonomy: () => ({
    stakeholders: [],
    requestTypes: [],
    openStakeholders: [],
    // Only active buckets may be moved *into*, so the hand-off picker reads this
    // rather than the full list.
    assignableStakeholders: [],
    closedSlug: null,
    stakeholderLabel: (slug: string | null | undefined) => slug ?? "—",
    requestTypeLabel: (slug: string | null | undefined) => slug ?? "—",
    isLoading: false,
    isConfigured: true,
  }),
  useProducts: () => ({ data: [] }),
  useAccounts: () => ({ data: [] }),
}));

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Through the native setter: React caches the node's last value and would
  // treat a plain assignment as no change, so onChange would never fire.
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonWith(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  expect(found, label).toBeDefined();
  return found as HTMLButtonElement;
}

describe("Service Desk outbound email card", () => {
  let container: HTMLDivElement;
  let root: Root;

  const fields = () => ({
    to: container.querySelector<HTMLInputElement>('input[list="sd-email-recipients"]')!,
    // Cc sits between To/Subject and the body; the placeholder is the stable handle.
    cc: container.querySelector<HTMLInputElement>('input[placeholder="detail.emailCcPlaceholder"]')!,
    subject: Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => input.previousElementSibling?.textContent === "detail.emailSubject",
    ),
    body: container.querySelector<HTMLTextAreaElement>("textarea")!,
  });

  beforeEach(() => {
    mocks.email.mockReset();
    mocks.email.mockResolvedValue(undefined);
    mocks.canSendEmail = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("sends to a typed address with the Cc list parsed", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.to, "bhanu423@gmail.com"));
    await act(async () => type(form.cc, "ops@bimaplan.co, broker@partner.example"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));

    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0][0]).toEqual({
      id: "ticket-1",
      data: {
        to: "bhanu423@gmail.com",
        cc: ["ops@bimaplan.co", "broker@partner.example"],
        subject: "Following up",
        body: "Here is the update.",
        attachment_filenames: [],
        move_ticket: true,
      },
    });
  });

  it("fills the recipient from a configured address in one click", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    await act(async () =>
      buttonWith(container, "Requester — requester@example.com").click(),
    );

    expect(fields().to.value).toBe("requester@example.com");
  });

  it("shows the subject the server will actually send", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.to, "bhanu423@gmail.com"));
    await act(async () => type(form.body, "Here is the update."));

    // No id typed: the desk adds it.
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    expect(container.textContent).toContain("[SD-5] Following up");

    // Already carries this ticket's id: it must not be doubled, because the
    // server will not add it either.
    await act(async () => type(form.subject!, "Re: SD-5 following up"));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    expect(container.textContent).toContain("Re: SD-5 following up");
    expect(container.textContent).not.toContain("[SD-5] Re: SD-5");
  });

  it("refuses to send when the ticket has no connected mailbox", async () => {
    mocks.canSendEmail = false;
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.to, "bhanu423@gmail.com"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));

    // Said up front, not after a 502 has thrown the message away.
    expect(container.textContent).toContain("detail.emailNoMailbox");
    expect(buttonWith(container, "detail.emailReview").disabled).toBe(true);
  });

  it("refuses to review while a Cc address is malformed", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.to, "bhanu423@gmail.com"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));
    await act(async () => type(form.cc, "not-an-address"));

    expect(buttonWith(container, "detail.emailReview").disabled).toBe(true);

    await act(async () => type(form.cc, "broker@partner.example"));

    expect(buttonWith(container, "detail.emailReview").disabled).toBe(false);
  });
});
