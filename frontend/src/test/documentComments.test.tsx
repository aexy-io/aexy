import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentComments } from "@/components/docs/DocumentComments";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  comments: [] as unknown[],
  total: 0,
  unresolvedCount: 0,
  createComment: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));

vi.mock("@/hooks/useDocumentComments", () => ({
  useDocumentComments: () => ({
    comments: mocks.comments,
    total: mocks.total,
    unresolvedCount: mocks.unresolvedCount,
    isLoading: false,
    error: null,
    createComment: mocks.createComment,
    isCreating: false,
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    setResolved: vi.fn(),
  }),
}));

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    document_id: "d-1",
    parent_id: null,
    author_id: "someone-else",
    author_name: "Ada",
    author_avatar: null,
    content: "<p>Is step 3 still right?</p>",
    is_resolved: false,
    resolved_by_id: null,
    resolved_at: null,
    is_deleted: false,
    is_edited: false,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    replies: [],
    ...overrides,
  };
}

describe("DocumentComments", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.comments = [];
    mocks.total = 0;
    mocks.unresolvedCount = 0;
    mocks.createComment = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = () =>
    act(async () =>
      root.render(<DocumentComments workspaceId="ws-1" documentId="d-1" />)
    );

  it("renders a thread with its author and body", async () => {
    mocks.comments = [comment()];
    mocks.total = 1;
    mocks.unresolvedCount = 1;
    await render();

    expect(container.textContent).toContain("Ada");
    expect(container.textContent).toContain("Is step 3 still right?");
    expect(container.textContent).toContain("1 open");
  });

  /**
   * Comment bodies are HTML written by other workspace members and rendered with
   * dangerouslySetInnerHTML so mention anchors survive. That is an injection path
   * from any member into every reader of the document, so the sanitiser is the
   * thing standing between those two facts.
   */
  it("strips scripts and event handlers from comment content", async () => {
    mocks.comments = [
      comment({
        content:
          '<p>hi<script>window.__pwned = true</script>' +
          '<img src=x onerror="window.__pwned = true"></p>',
      }),
    ];
    await render();

    const body = container.querySelector('[data-testid="comment-content"]')!;
    expect(body.innerHTML).not.toContain("<script");
    expect(body.innerHTML).not.toContain("onerror");
    expect(body.textContent).toContain("hi");
  });

  it("keeps mention links, which are how mentions round-trip", async () => {
    mocks.comments = [
      comment({
        content: '<p><a href="mention:user:abc-123">@Ada</a> take a look</p>',
      }),
    ];
    await render();

    const body = container.querySelector('[data-testid="comment-content"]')!;
    expect(body.innerHTML).toContain("mention:user:abc-123");
  });

  it("shows a deleted comment as a placeholder so replies keep their place", async () => {
    mocks.comments = [
      comment({
        is_deleted: true,
        content: "",
        replies: [comment({ id: "c-2", parent_id: "c-1", content: "<p>reply</p>" })],
      }),
    ];
    await render();

    expect(container.textContent).toContain("Comment deleted");
    expect(container.textContent).toContain("reply");
  });

  /**
   * A resolved thread stays visible down to its opening comment, with the replies
   * folded away. Hiding it entirely loses the record of why the document says what
   * it says; leaving it fully expanded buries the threads still waiting on someone.
   */
  it("collapses a resolved thread to its opening comment", async () => {
    mocks.comments = [
      comment({
        is_resolved: true,
        replies: [comment({ id: "c-2", parent_id: "c-1", content: "<p>fixed it</p>" })],
      }),
    ];
    await render();

    expect(container.querySelector('[data-testid="thread-resolved"]')).not.toBeNull();
    // You can still see what was resolved…
    expect(container.textContent).toContain("Is step 3 still right?");
    // …but the conversation under it is folded until asked for.
    expect(container.textContent).not.toContain("fixed it");
    expect(container.textContent).toContain("show 1 reply");
  });

  it("offers edit and delete only on your own comments", async () => {
    mocks.comments = [comment({ author_id: "someone-else" })];
    await render();
    expect(container.querySelector('[data-testid="comment-edit"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.comments = [comment({ author_id: "me" })];
    await render();
    expect(container.querySelector('[data-testid="comment-edit"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comment-delete"]')).not.toBeNull();
  });

  it("does not post an empty comment", async () => {
    await render();
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="comment-submit"]'
    )!;
    expect(button.disabled).toBe(true);
    expect(mocks.createComment).not.toHaveBeenCalled();
  });
});
