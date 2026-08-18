/**
 * One affected page, and what the author is told about it.
 *
 * The things worth asserting are the ones that decide whether this gets muted:
 *
 * * the screenshot line appears only when there are screenshots, and names where
 *   they are — a generic "check your screenshots" is the version that fails;
 * * "Ask for an update" carries the warning that a generated update *destroys*
 *   those screenshots, and is demoted from a button on exactly the pages where
 *   that matters. `markdown_to_tiptap` has no image case, so this is true rather
 *   than cautious;
 * * "No update needed" says plainly that it does not clear the page's own badge,
 *   because claiming otherwise would make the sidebar dot a lie.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImpactDocumentCard } from "@/components/docs/impact/ImpactDocumentCard";
import type { ImpactItem } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function link(overrides: Partial<ImpactItem["links"][0]> = {}) {
  return {
    code_link_id: "link-1",
    path: "frontend/src/components/tickets",
    link_type: "directory",
    branch: "main",
    sync_mode: "propose",
    template_category: "guides",
    has_pending_changes: true,
    last_synced_at: null,
    owner_developer_id: "dev-1",
    matched_paths: ["frontend/src/components/tickets/FilterBar.tsx"],
    ...overrides,
  };
}

function item(overrides: Partial<ImpactItem> = {}): ImpactItem {
  return {
    document_id: "doc-1",
    document_title: "Filtering tickets",
    document_icon: "🎫",
    document_updated_at: "2026-08-01T00:00:00Z",
    status: "needs_review",
    links: [link()],
    screenshots: { count: 0, spots: [] },
    guidance: [],
    proposal_id: null,
    dismissed_at: null,
    dismissed_by_developer_id: null,
    dismissed_by_name: null,
    dismiss_reason: null,
    ...overrides,
  };
}

function renderCard(overrides: Partial<ImpactItem> = {}, handlers = {}) {
  const props = {
    onDismiss: vi.fn(),
    onUndismiss: vi.fn(),
    onAskForUpdate: vi.fn(),
    ...handlers,
  };
  // No provider: `src/test/setup.ts` mocks next-intl against the real English
  // message files, so these assertions are about the copy a reader sees rather
  // than about the spelling of a key.
  render(
    <ul>
      <ImpactDocumentCard item={item(overrides)} {...props} />
    </ul>
  );
  return props;
}

describe("what the card says", () => {
  it("names the page and the files that touched it", () => {
    renderCard();

    expect(screen.getByText("Filtering tickets")).toBeInTheDocument();
    // Named, not counted: "FilterBar.tsx" tells the author whether this is about
    // them; "1 file changed" does not.
    expect(screen.getByTestId("impact-paths-doc-1").textContent).toContain(
      "FilterBar.tsx"
    );
  });

  it("shows the page is behind its code", () => {
    renderCard();
    expect(screen.getByText("Behind the code")).toBeInTheDocument();
  });

  it("says nothing about screenshots when there are none", () => {
    renderCard();
    expect(screen.queryByTestId("impact-guidance-screenshots")).toBeNull();
    expect(screen.queryByTestId("impact-screenshot-count-doc-1")).toBeNull();
  });

  it("does not volunteer the count when the change cannot have touched them", () => {
    // A page with screenshots, and a change the server judged irrelevant to them
    // — a backend-only pull request. The count is still true, and saying it here
    // would imply a relevance the server just decided against.
    renderCard({
      screenshots: { count: 3, spots: [{ heading: "A", label: "a.png" }] },
      guidance: [],
    });

    expect(screen.queryByTestId("impact-screenshot-count-doc-1")).toBeNull();
    expect(screen.queryByTestId("impact-guidance-screenshots")).toBeNull();
    // But the update button still warns, because that is about what the *action*
    // would do to those images, not about this change.
    expect(screen.getByTestId("impact-image-warning-doc-1")).toBeInTheDocument();
  });
});

describe("the screenshot guidance", () => {
  const withScreenshots = {
    screenshots: {
      count: 3,
      spots: [
        { heading: "Creating a filter", label: "filter-bar.png" },
        { heading: "Saved views", label: "saved-views.png" },
      ],
    },
    guidance: [
      {
        id: "screenshots",
        params: {
          count: 3,
          headings: ["Creating a filter", "Saved views"],
          labels: ["filter-bar.png", "saved-views.png"],
        },
      },
      { id: "route", params: { routes: ["/tickets"] } },
    ],
  } satisfies Partial<ImpactItem>;

  it("names how many and which sections they sit in", () => {
    renderCard(withScreenshots);

    const line = screen.getByTestId("impact-guidance-screenshots").textContent!;
    expect(line).toContain("3 screenshots");
    expect(line).toContain("Creating a filter");
    expect(line).toContain("Saved views");
  });

  it("names the screen the change touched, under the count", () => {
    renderCard(withScreenshots);

    const route = screen.getByTestId("impact-guidance-route").textContent!;
    expect(route).toContain("/tickets");
  });

  it("names the files, so somebody knows what to replace", () => {
    renderCard(withScreenshots);
    const line = screen.getByTestId("impact-guidance-screenshots").textContent!;
    expect(line).toContain("filter-bar.png");
  });

  it("drops the section clause when there is no heading to name", () => {
    renderCard({
      screenshots: { count: 1, spots: [{ heading: null, label: null }] },
      guidance: [{ id: "screenshots", params: { count: 1, headings: [], labels: [] } }],
    });

    const line = screen.getByTestId("impact-guidance-screenshots").textContent!;
    expect(line).toContain("One screenshot");
    // Not a dangling "under".
    expect(line).not.toContain("under");
  });

  it("warns that a generated update will destroy them", () => {
    renderCard(withScreenshots);

    const warning = screen.getByTestId("impact-image-warning-doc-1").textContent!;
    expect(warning).toContain("will not carry");
    expect(warning).toContain("3 screenshots");
  });

  it("demotes the update button to a link when the page has images", () => {
    renderCard(withScreenshots);
    // Not a bordered button: on the pages this feature exists for, asking for a
    // generated update is the destructive option and must not look primary.
    const control = screen.getByTestId("impact-ask-update-doc-1");
    expect(control.className).not.toContain("border-border");
    expect(control.className).toContain("underline");
  });

  it("keeps it an ordinary button when there are no images to lose", () => {
    renderCard();
    const control = screen.getByTestId("impact-ask-update-doc-1");
    expect(control.className).toContain("border-border");
    expect(screen.queryByTestId("impact-image-warning-doc-1")).toBeNull();
  });
});

describe("no update needed", () => {
  it("asks why, optionally, before recording it", () => {
    const props = renderCard();

    fireEvent.click(screen.getByTestId("impact-dismiss-doc-1"));
    fireEvent.change(screen.getByTestId("impact-reason-doc-1"), {
      target: { value: "Renamed a prop, prose unaffected" },
    });
    fireEvent.click(screen.getByTestId("impact-dismiss-confirm-doc-1"));

    expect(props.onDismiss).toHaveBeenCalledWith(
      "doc-1",
      "Renamed a prop, prose unaffected"
    );
  });

  it("records it with no reason at all", () => {
    const props = renderCard();

    fireEvent.click(screen.getByTestId("impact-dismiss-doc-1"));
    fireEvent.click(screen.getByTestId("impact-dismiss-confirm-doc-1"));

    expect(props.onDismiss).toHaveBeenCalledWith("doc-1", undefined);
  });

  it("says plainly that it does not clear the page's own badge", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("impact-dismiss-doc-1"));

    expect(
      screen.getByText(/keeps its own out-of-date badge/i)
    ).toBeInTheDocument();
  });

  it("shows who said no, and why, with an undo", () => {
    renderCard({
      status: "dismissed",
      dismissed_at: "2026-08-17T00:00:00Z",
      dismissed_by_name: "Anita",
      dismiss_reason: "Prop rename only",
    });

    const line = screen.getByTestId("impact-dismissed-doc-1").textContent!;
    expect(line).toContain("Anita");
    expect(line).toContain("Prop rename only");
    expect(screen.getByTestId("impact-undo-doc-1")).toBeInTheDocument();
  });

  it("offers no dismiss control on something already dismissed", () => {
    renderCard({ status: "dismissed", dismissed_at: "2026-08-17T00:00:00Z" });
    expect(screen.queryByTestId("impact-dismiss-doc-1")).toBeNull();
  });
});

describe("not asking twice for the same work", () => {
  it("links to the waiting proposal and hides its own update button", () => {
    renderCard({ status: "proposal_pending", proposal_id: "prop-1" });

    expect(screen.getByTestId("impact-proposal-doc-1")).toBeInTheDocument();
    // A second proposal is just a second thing for somebody to review.
    expect(screen.queryByTestId("impact-ask-update-doc-1")).toBeNull();
  });

  it("credits an author who already edited the page", () => {
    renderCard({ status: "edited" });
    // "Edited since", not "updated": autosave bumps updated_at on any keystroke.
    expect(screen.getByTestId("impact-edited-doc-1").textContent).toContain(
      "Edited since"
    );
  });

  it("cannot ask for an update on a muted page", () => {
    renderCard({ links: [link({ sync_mode: "off" })] });

    expect(screen.getByText("Muted")).toBeInTheDocument();
    expect(screen.queryByTestId("impact-ask-update-doc-1")).toBeNull();
  });

  it("passes the link's own category, not the client default", () => {
    const props = renderCard({ links: [link({ template_category: "guides" })] });

    fireEvent.click(screen.getByTestId("impact-ask-update-doc-1"));

    // Left to the default, `generate` sends "function_docs" and silently changes
    // what kind of document this is.
    expect(props.onAskForUpdate).toHaveBeenCalledWith("doc-1", "guides");
  });
});

describe("the leftovers a review found", () => {
  it("disables every action while one is in flight", () => {
    // Asking for an update is the most expensive stray click on this page: each
    // one spends an LLM call and leaves another thing for somebody to review, so
    // it has to be covered by the same busy flag as the cheap ones.
    render(
      <ul>
        <ImpactDocumentCard
          item={item()}
          onDismiss={vi.fn()}
          onUndismiss={vi.fn()}
          onAskForUpdate={vi.fn()}
          isBusy
        />
      </ul>
    );
    expect(screen.getByTestId("impact-ask-update-doc-1")).toBeDisabled();
    expect(screen.getByTestId("impact-dismiss-doc-1")).toBeDisabled();
  });
});

describe("what a screen reader gets", () => {
  it("announces the dismiss control as a disclosure, not a plain button", () => {
    // Without this the button reads as "No update needed, button" and nothing
    // says a panel appeared — the visible cue is the only cue.
    renderCard();
    const toggle = screen.getByTestId("impact-dismiss-doc-1");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "dismiss-panel-doc-1");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // And the thing it claims to control actually exists.
    expect(document.getElementById("dismiss-panel-doc-1")).toBeInTheDocument();
  });

  it("announces the outcome of saying no", () => {
    // The sighted feedback is this line appearing and the card fading. A toast is
    // not tied to the card and may not be read at all.
    renderCard({
      status: "dismissed",
      dismissed_at: "2026-08-18T00:00:00Z",
      dismissed_by_name: "Anita",
    });

    const line = screen.getByTestId("impact-dismissed-doc-1");
    expect(line).toHaveAttribute("role", "status");
    expect(line).toHaveAttribute("aria-live", "polite");
  });
});
