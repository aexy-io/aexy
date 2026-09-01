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
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
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
      reply_all: {
        to: "requester@example.com",
        cc: ["colleague@example.com", "broker@partner.example"],
      },
      assignment_note: null,
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
    publishToCommunity: { mutate: vi.fn(), isPending: false },
    splitDetectedIssues: { mutate: vi.fn(), isPending: false, isError: false, data: undefined },
    changePendingWith: { mutateAsync: vi.fn(), isPending: false },
    convertToTask: { mutate: vi.fn(), isPending: false },
    updateTicket: { mutateAsync: vi.fn(), isPending: false, isError: false },
    emailStakeholder: { mutateAsync: mocks.email, isPending: false, isError: false },
    uploadFiles: { mutate: vi.fn(), isPending: false },
    deleteUpload: { mutate: vi.fn(), isPending: false },
    downloadUpload: { mutate: vi.fn(), isPending: false },
  }),
  // Publishing to the community is opt-in and off by default, so the card the
  // ticket page renders for it is absent here — which is the default state.
  useCommunityPublishTargets: () => ({ data: { enabled: false, community_slug: null, channels: [] } }),
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

/** The first button whose aria-label starts with `prefix` — the Cc chips label
 *  themselves per address, so the exact text is not a stable handle. */
function buttonWith2(container: HTMLElement, prefix: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) =>
    (button.getAttribute("aria-label") ?? "").startsWith(prefix),
  );
  expect(found, prefix).toBeDefined();
  return found as HTMLButtonElement;
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
    // Typing a different recipient drops the thread's chain — see the
    // redirect test below — so this send carries only what is typed here.
    await act(async () => type(form.to, "surveyor@example.net"));
    await act(async () => type(form.cc, "ops@desk.example, broker@partner.example"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));

    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0][0]).toEqual({
      id: "ticket-1",
      data: {
        to: "surveyor@example.net",
        cc: ["ops@desk.example", "broker@partner.example"],
        subject: "Following up",
        body: "Here is the update.",
        attachment_filenames: [],
        attachment_ids: [],
        move_ticket: true,
      },
    });
  });

  it("opens addressed to the thread, with everyone on it already copied", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    // The whole of the reply-all ask: answering the ticket keeps the people the
    // requester had on the mail, instead of reaching one address out of three.
    expect(fields().to.value).toBe("requester@example.com");
    expect(container.textContent).toContain("colleague@example.com");
    expect(container.textContent).toContain("broker@partner.example");

    const form = fields();
    await act(async () => type(form.body, "On it."));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(mocks.email.mock.calls[0][0].data.cc).toEqual([
      "colleague@example.com",
      "broker@partner.example",
    ]);
  });

  it("lets one person be taken off the chain without disturbing the rest", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    await act(async () =>
      buttonWith2(container, "detail.emailCcRemove").click(),
    );

    const form = fields();
    await act(async () => type(form.body, "On it."));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(mocks.email.mock.calls[0][0].data.cc).toEqual(["broker@partner.example"]);
  });

  it("re-seeds from the thread the send returned, not the copy before it", async () => {
    // Somebody looped in by hand is on the conversation from that moment. Waiting
    // for the background refetch to say so would re-seed the box from the copy
    // that predates the very message being sent.
    mocks.email.mockResolvedValue({
      subject: "Test Ticket",
      requester_email: "requester@example.com",
      reply_all: {
        to: "requester@example.com",
        cc: ["colleague@example.com", "broker@partner.example", "surveyor@example.net"],
      },
    });

    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.body, "On it."));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(container.textContent).toContain("surveyor@example.net");
    expect(fields().to.value).toBe("requester@example.com");
  });

  it("drops the chain when the reply is redirected to somebody else", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    // Copying a partner's colleagues onto a message to an insurer is a
    // disclosure the sender never asked for, so changing the recipient clears
    // what was carried over rather than quietly taking it along.
    await act(async () => type(fields().to, "claims@insurer.example"));

    expect(container.textContent).not.toContain("colleague@example.com");

    const form = fields();
    await act(async () => type(form.body, "Please quote."));
    await act(async () => buttonWith(container, "detail.emailReview").click());
    await act(async () => buttonWith(container, "detail.emailConfirmSend").click());

    expect(mocks.email.mock.calls[0][0].data.cc).toEqual([]);
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
    await act(async () => type(form.to, "surveyor@example.net"));
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
    await act(async () => type(form.to, "surveyor@example.net"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));

    // Said up front, not after a 502 has thrown the message away.
    expect(container.textContent).toContain("detail.emailNoMailbox");
    expect(buttonWith(container, "detail.emailReview").disabled).toBe(true);
  });

  it("refuses to review while a Cc address is malformed", async () => {
    await act(async () => root.render(<ServiceDeskTicketDetailPage />));

    const form = fields();
    await act(async () => type(form.to, "surveyor@example.net"));
    await act(async () => type(form.subject!, "Following up"));
    await act(async () => type(form.body, "Here is the update."));
    await act(async () => type(form.cc, "not-an-address"));

    expect(buttonWith(container, "detail.emailReview").disabled).toBe(true);

    await act(async () => type(form.cc, "broker@partner.example"));

    expect(buttonWith(container, "detail.emailReview").disabled).toBe(false);
  });
});
