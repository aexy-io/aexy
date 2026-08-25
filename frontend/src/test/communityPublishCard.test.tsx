import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishToCommunityCard } from "@/app/(app)/service-desk/tickets/[ticketId]/PublishToCommunityCard";
import type { ServiceDeskTicketDetail } from "@/lib/service-desk-api";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  targets: {
    data: { enabled: false, community_slug: null, channels: [] } as {
      enabled: boolean;
      community_slug: string | null;
      channels: Array<{ id: string; slug: string; name: string }>;
    },
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useServiceDesk", () => ({
  useCommunityPublishTargets: () => mocks.targets,
  useServiceDeskMutations: () => ({
    publishToCommunity: { mutate: mocks.publish, isPending: false },
  }),
}));

function ticketFixture(
  overrides: Partial<ServiceDeskTicketDetail> = {},
): ServiceDeskTicketDetail {
  return {
    subject: "Renewal quote is wrong",
    community_topic: null,
    correspondence: [
      {
        id: "r1",
        author_email: "customer@example.com",
        author_name: null,
        content: "The quote says 12 months, we asked for 24.",
        created_at: "2026-08-01T09:00:00Z",
        direction: "incoming",
      },
      {
        id: "r2",
        author_email: "desk@example.com",
        author_name: "Desk",
        content: "Re-issued with a 24-month term — the renewal date drives the term.",
        created_at: "2026-08-01T10:00:00Z",
        direction: "outgoing",
      },
    ],
    // The card reads only these fields; the rest of the detail is irrelevant to it.
    ...overrides,
  } as unknown as ServiceDeskTicketDetail;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.publish.mockReset();
  mocks.targets.data = { enabled: false, community_slug: null, channels: [] };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(ticket: ServiceDeskTicketDetail) {
  act(() => {
    root.render(<PublishToCommunityCard ticket={ticket} ticketId="t-1" />);
  });
}

describe("Publish to community, from a ticket", () => {
  it("renders nothing at all while the link is switched off", () => {
    // The default state of every workspace. The action must not merely refuse —
    // it must not be there, because an offer that always fails is worse than
    // none.
    render(ticketFixture());
    expect(container.textContent).toBe("");
    expect(container.querySelector("[data-testid=publish-to-community-open]")).toBeNull();
  });

  it("renders nothing when the link is on but nowhere is published yet", () => {
    mocks.targets.data = { enabled: true, community_slug: "acme", channels: [] };
    render(ticketFixture());
    expect(container.textContent).toBe("");
  });

  it("offers the action once a public channel exists", () => {
    mocks.targets.data = {
      enabled: true,
      community_slug: "acme",
      channels: [{ id: "ch-1", slug: "help", name: "Help" }],
    };
    render(ticketFixture());
    expect(
      container.querySelector("[data-testid=publish-to-community-open]"),
    ).not.toBeNull();
  });

  it("pre-fills the composer from the ticket, ready to be edited", () => {
    mocks.targets.data = {
      enabled: true,
      community_slug: "acme",
      channels: [{ id: "ch-1", slug: "help", name: "Help" }],
    };
    render(ticketFixture());

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-testid=publish-to-community-open]")!
        .click();
    });

    const title = container.querySelector<HTMLInputElement>("[data-testid=publish-title]")!;
    const body = container.querySelector<HTMLTextAreaElement>("[data-testid=publish-body]")!;
    expect(title.value).toBe("Renewal quote is wrong");
    // Seeded from the desk's own reply, not the customer's message — the answer
    // is what gets published, and a human still edits it before it goes out.
    expect(body.value).toContain("Re-issued with a 24-month term");
    expect(body.value).not.toContain("we asked for 24");
  });

  it("will not publish until a channel is chosen", () => {
    mocks.targets.data = {
      enabled: true,
      community_slug: "acme",
      channels: [{ id: "ch-1", slug: "help", name: "Help" }],
    };
    render(ticketFixture());
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-testid=publish-to-community-open]")!
        .click();
    });

    const submit = container.querySelector<HTMLButtonElement>(
      "[data-testid=publish-submit]",
    )!;
    expect(submit.disabled).toBe(true);
    act(() => submit.click());
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("shows the public thread instead of the composer once published", () => {
    mocks.targets.data = {
      enabled: true,
      community_slug: "acme",
      channels: [{ id: "ch-1", slug: "help", name: "Help" }],
    };
    render(
      ticketFixture({
        community_topic: {
          topic_id: "tp-1",
          channel_slug: "help",
          channel_name: "Help",
          community_slug: "acme",
          path: "/community/acme/help/renewal-term-ab12cd34ef",
          published_at: "2026-08-02T09:00:00Z",
          live: true,
        },
      }),
    );

    const link = container.querySelector<HTMLAnchorElement>("a[href*='/community/acme/']")!;
    expect(link).not.toBeNull();
    expect(link.href).toContain("/community/acme/help/renewal-term-ab12cd34ef");
    // No second composer — the answer is already out there.
    expect(container.querySelector("[data-testid=publish-to-community-open]")).toBeNull();
  });

  it("says so when the thread exists but the community is not live", () => {
    render(
      ticketFixture({
        community_topic: {
          topic_id: "tp-1",
          channel_slug: "help",
          channel_name: "Help",
          community_slug: "acme",
          path: "/community/acme/help/renewal-term-ab12cd34ef",
          published_at: "2026-08-02T09:00:00Z",
          live: false,
        },
      }),
    );
    expect(container.textContent).toContain("detail.publishedNotLive");
  });
});
