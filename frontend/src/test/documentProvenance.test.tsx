/**
 * "This page describes that code, and it is either current or it is not."
 *
 * A generated document used to look exactly like a hand-written one, so the
 * two facts that decide whether you can trust it — where it came from, and
 * whether the code has moved since — were invisible.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentProvenance } from "@/components/docs/DocumentProvenance";
import type { DocumentCodeLink } from "@/lib/api";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const link = (overrides: Partial<DocumentCodeLink> = {}): DocumentCodeLink =>
  ({
    id: "link-1",
    document_id: "doc-1",
    repository_id: "repo-1",
    repository_name: "acme/widgets",
    path: "src/pkg",
    link_type: "directory",
    branch: "main",
    document_section_id: null,
    last_commit_sha: "abc1234",
    last_content_hash: null,
    last_synced_at: "2026-03-01T00:00:00Z",
    has_pending_changes: false,
    owner_developer_id: "dev-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  }) as DocumentCodeLink;

function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    createRoot(container).render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    );
  });
  return container;
}

describe("DocumentProvenance", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing when the document has no code links", () => {
    // An unlinked document has no source to be out of date with, so a strip
    // saying "in sync" would be an assertion about nothing.
    const container = render(
      <DocumentProvenance workspaceId="ws-1" documentId="doc-1" codeLinks={[]} />
    );

    expect(container.querySelector("[data-testid='document-provenance']")).toBeNull();
  });

  it("shows the repository path and branch it came from", () => {
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link()]}
      />
    );

    expect(container.textContent).toContain("acme/widgets/src/pkg");
    expect(container.textContent).toContain("main");
  });

  it("says it is behind when the code has moved", () => {
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link({ has_pending_changes: true })]}
      />
    );

    expect(
      container.querySelector("[data-testid='provenance-behind-link-1']")
    ).not.toBeNull();
    expect(container.textContent).toContain("Behind the code");
  });

  it("says it is current when the code has not", () => {
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link()]}
      />
    );

    expect(
      container.querySelector("[data-testid='provenance-current-link-1']")
    ).not.toBeNull();
    expect(container.textContent).toContain("In sync as of");
  });

  it("distinguishes never generated from in sync", () => {
    // Different work for whoever picks it up: one is a revision, the other is
    // a first draft.
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link({ last_synced_at: null })]}
      />
    );

    expect(container.textContent).toContain("Not generated yet");
  });

  it("flags a sync nobody owns", () => {
    // Ownership decides whose plan tier drives the sync and whose GitHub
    // access it falls back on, so an orphan is worth showing, not hiding.
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link({ owner_developer_id: null })]}
      />
    );

    expect(container.textContent).toContain("Unowned");
  });

  it("offers an update only when there is something to update", () => {
    const current = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link()]}
        onSync={() => {}}
      />
    );
    expect(
      current.querySelector("[data-testid='provenance-sync-now']")
    ).toBeNull();

    const behind = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[link({ has_pending_changes: true })]}
        onSync={() => {}}
      />
    );
    expect(
      behind.querySelector("[data-testid='provenance-sync-now']")
    ).not.toBeNull();
  });

  it("counts how many linked paths have moved", () => {
    const container = render(
      <DocumentProvenance
        workspaceId="ws-1"
        documentId="doc-1"
        codeLinks={[
          link({ id: "a", has_pending_changes: true }),
          link({ id: "b", has_pending_changes: true }),
          link({ id: "c" }),
        ]}
      />
    );

    expect(container.textContent).toContain("2 of the linked paths");
  });
});
