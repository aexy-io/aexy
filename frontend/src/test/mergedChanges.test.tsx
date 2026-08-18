/**
 * "You merged this last week. Is it written down anywhere?"
 *
 * The stale-document list can only find pages that already exist. The larger
 * gap is the change nobody wrote about at all, and there was no queue for it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MergedChanges } from "@/components/docs/MergedChanges";
import type { MergedChangeItem } from "@/lib/api";

const listMergedChanges = vi.fn();

vi.mock("@/lib/api", () => ({
  documentApi: {
    listMergedChanges: (...args: unknown[]) => listMergedChanges(...args),
  },
}));

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

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8")
);

const change = (overrides: Partial<MergedChangeItem> = {}): MergedChangeItem => ({
  pull_request_id: "pr-1",
  number: 41,
  title: "Rework session expiry",
  repository: "acme/widgets",
  repository_id: "repo-1",
  merged_at: "2026-08-14T00:00:00Z",
  author_name: "Anita",
  merged_by_login: "riya",
  additions: 120,
  deletions: 8,
  files_changed: 6,
  repository_document_count: 3,
  impact_affected_count: 0,
  ...overrides,
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MergedChanges workspaceId="ws-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("MergedChanges", () => {
  beforeEach(() => listMergedChanges.mockReset());

  it("carries the change into the generator instead of asking again", async () => {
    listMergedChanges.mockResolvedValue([change()]);
    renderPanel();

    const link = (await waitFor(() =>
      screen.getByTestId("merged-change-document-pr-1")
    )) as HTMLAnchorElement;

    // The repository, so the generator opens where the code is...
    expect(link.getAttribute("href")).toContain("generate=repo-1");
    // ...and what to write about, which is the only part a person typed.
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
      "#41: Rework session expiry"
    );
  });

  it("says when a repository has no documentation at all", async () => {
    listMergedChanges.mockResolvedValue([
      change({ repository_document_count: 0 }),
    ]);
    renderPanel();

    await waitFor(() =>
      expect(
        screen.getByTestId("merged-change-undocumented-repo-pr-1")
      ).toBeInTheDocument()
    );
  });

  it("makes no claim about this particular change being documented", async () => {
    // `pull_requests` does not record the files a change touched, so a
    // per-change badge would be a guess — and a wrong "already documented" is
    // the one that stops somebody writing.
    listMergedChanges.mockResolvedValue([
      change({ repository_document_count: 3 }),
    ]);
    renderPanel();

    await waitFor(() => screen.getByTestId("merged-change-pr-1"));
    expect(
      screen.queryByTestId("merged-change-undocumented-repo-pr-1")
    ).toBeNull();
    expect(screen.queryByText(/already documented/i)).toBeNull();
  });

  it("renders nothing rather than an empty heading", async () => {
    listMergedChanges.mockResolvedValue([]);
    renderPanel();

    await waitFor(() => expect(listMergedChanges).toHaveBeenCalled());
    expect(screen.queryByTestId("merged-changes")).toBeNull();
  });

  it("offers no link when the repository has been disconnected", async () => {
    listMergedChanges.mockResolvedValue([change({ repository_id: null })]);
    renderPanel();

    await waitFor(() => screen.getByTestId("merged-change-pr-1"));
    // A dead link into the generator would open an empty repository browser.
    expect(screen.queryByTestId("merged-change-document-pr-1")).toBeNull();
    expect(screen.getByText("Repository disconnected")).toBeInTheDocument();
  });

  it("is mounted, and the generator reads the prompt it sends", () => {
    const page = readFileSync(
      resolve(__dirname, "../app/(app)/docs/page.tsx"),
      "utf8"
    );
    expect(page).toMatch(/<MergedChanges\s/);
    // Without this the link opens on the right repository and drops the only
    // instruction it carried.
    expect(page).toMatch(/searchParams\?\.get\("prompt"\)/);
    expect(page).toMatch(/setCustomPrompt\(requestedPrompt\)/);
  });
});

describe("the way back into the impact page", () => {
  it("links to it when this merge affected pages", async () => {
    // The only durable entry point. The notification is one row somebody clears
    // and the pull request comment is off by default, so without this link the
    // page is reachable exactly once, and only ever by the author.
    listMergedChanges.mockResolvedValue([
      change({ impact_affected_count: 3 }),
    ]);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("merged-change-impact-pr-1")).toBeInTheDocument()
    );
    const link = screen.getByTestId("merged-change-impact-pr-1");
    expect(link).toHaveAttribute("href", "/docs/impact/repo-1/41");
    expect(link.textContent).toContain("3 pages affected");
  });

  it("shows no link when it affected none", async () => {
    // Zero also covers "never evaluated", and a link to "nothing here describes
    // this change" is worse than no link at all.
    listMergedChanges.mockResolvedValue([
      change({ impact_affected_count: 0 }),
    ]);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("merged-changes")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("merged-change-impact-pr-1")).toBeNull();
  });
});
