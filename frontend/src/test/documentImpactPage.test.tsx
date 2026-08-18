/**
 * The three states the page can be in before it shows any cards, and the one
 * that was wrong.
 *
 * A failed request used to render "This pull request has not been checked / It
 * landed before documentation impact was tracked" — telling somebody whose
 * request 403'd or timed out that *the feature never ran*. Those are opposite
 * facts, and the wrong one sends you to look in the wrong place.
 *
 * Asserted here rather than in a browser because the app's auth guard bounces a
 * bad token before the page renders, and the workspace store rewrites a bogus
 * workspace id — so the failure this covers is reachable in production and not
 * from the address bar.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DocumentImpactPage from "@/app/(app)/docs/impact/[repositoryId]/[prNumber]/page";
import type { DocImpactResponse } from "@/lib/api";

const get = vi.fn();

vi.mock("@/lib/api", () => ({
  docImpactApi: {
    get: (...args: unknown[]) => get(...args),
    dismiss: vi.fn(),
    undismiss: vi.fn(),
  },
  documentApi: { generate: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repositoryId: "repo-1", prNumber: "412" }),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspaceId: "ws-1" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DocumentImpactPage />
    </QueryClientProvider>
  );
}

function impact(overrides: Partial<DocImpactResponse> = {}): DocImpactResponse {
  return {
    analyzed: true,
    repository_id: "repo-1",
    repository_full_name: "acme/app",
    pull_request_number: 412,
    repository_document_count: 2,
    items: [],
    impact_id: "i-1",
    pull_request_title: "Rework the ticket filters",
    state: "open",
    head_sha: "abc123",
    author_developer_id: null,
    author_login: "octocat",
    changed_path_count: 4,
    detected_at: "2026-08-17T00:00:00Z",
    merged_at: null,
    pr_comment_status: null,
    pr_comment_error: null,
    check_run_status: null,
    check_run_error: null,
    ...overrides,
  };
}

// No `beforeEach` reset of the mock, deliberately. Both clearing and resetting it
// discard vitest's handle on a promise the mock returned, and the rejection the
// error-state tests deliberately provoke was then reported as unhandled and failed
// the whole file. Every test below sets its own implementation, and none of them
// assert call counts, so there is nothing for a reset to buy.

describe("when the request fails", () => {
  it("says it could not load, not that nothing was checked", async () => {
    // An async function that throws, rather than a pre-built rejected promise:
    // the rejection is then produced inside the call React Query awaits, so it
    // is owned from the start instead of surfacing as an unhandled rejection.
    get.mockImplementation(async () => {
      throw new Error("Request failed with status code 403");
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-error")).toBeInTheDocument()
    );
    // The bug: these are opposite facts, and the wrong one sends somebody to
    // look in the wrong place.
    expect(screen.queryByTestId("impact-not-checked")).toBeNull();
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });

  it("offers a retry, because a transient failure is the common one", async () => {
    get.mockImplementation(async () => {
      throw new Error("Network Error");
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    );
  });
});

describe("when it was never evaluated", () => {
  it("stays calm and explains which kind of nothing this is", async () => {
    get.mockResolvedValue(
      impact({ analyzed: false, repository_document_count: 0, items: [] })
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-not-checked")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("impact-error")).toBeNull();
    // No page in this workspace is linked to anything in the repository — a
    // different sentence from "it landed before this was tracked".
    expect(screen.getByText(/no page in this workspace is linked/i)).toBeInTheDocument();
  });

  it("says it predates the feature when the repository does have pages", async () => {
    get.mockResolvedValue(impact({ analyzed: false, repository_document_count: 5 }));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/before documentation impact was tracked/i))
        .toBeInTheDocument()
    );
  });
});

describe("the header", () => {
  it("names the repository and links back to the pull request", async () => {
    get.mockResolvedValue(impact());
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-pr-link")).toBeInTheDocument()
    );
    const link = screen.getByTestId("impact-pr-link");
    // "#412" alone is useless to anybody with pull requests open in more than
    // one repository, and a page saying your change broke something should let
    // you get back to the change.
    expect(link.textContent).toContain("acme/app#412");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/app/pull/412"
    );
  });

  it("falls back to the bare number when the repository is gone", async () => {
    get.mockResolvedValue(impact({ repository_full_name: null }));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-heading")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("impact-pr-link")).toBeNull();
  });

  it("explains why no pull request comment appeared", async () => {
    get.mockResolvedValue(impact({ pr_comment_status: "permission_missing" }));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-pr-comment-blocked")).toBeInTheDocument()
    );
  });
});

describe("when nothing describes the change", () => {
  it("is a calm empty state, not an error", async () => {
    get.mockResolvedValue(impact({ items: [] }));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("impact-empty")).toBeInTheDocument()
    );
    expect(screen.getByText(/nobody was notified/i)).toBeInTheDocument();
  });
});
