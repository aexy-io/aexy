/**
 * The template offer on an already-blank document.
 *
 * The picker on the docs landing page only helps before the document exists;
 * anyone who hit "new" and landed on an empty editor previously had no route to a
 * template. What matters here is that it hands back the *loaded* template — the
 * list items carry no content, so applying one straight from the list would set an
 * empty body — and that "Blank" is not offered as a way out of blank.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentEmptyState } from "@/components/docs/DocumentEmptyState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  templates: [] as unknown[],
  getTemplate: vi.fn(),
}));

vi.mock("@/hooks/useDocuments", () => ({
  useTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    getTemplate: mocks.getTemplate,
  }),
}));

const RUNBOOK = {
  id: "sys:runbook",
  name: "Runbook",
  description: "How to operate a service",
  category: "guides",
  icon: "📕",
  is_system: true,
  variables: [],
};

const BLANK = { ...RUNBOOK, id: "sys:blank", name: "Blank", icon: "📄" };

describe("DocumentEmptyState", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onApply = vi.fn();

  const buttons = () =>
    Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim());

  beforeEach(() => {
    mocks.templates = [BLANK, RUNBOOK];
    mocks.getTemplate.mockReset();
    onApply.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () =>
    act(async () =>
      root.render(<DocumentEmptyState workspaceId="ws-1" onApply={onApply} />),
    );

  it("does not offer Blank as a way out of a blank page", async () => {
    await render();

    expect(buttons()).toEqual(["📕Runbook"]);
  });

  it("applies the loaded template, not the list item", async () => {
    // The list item has no `content_template`; only the fetched one does, so
    // applying straight from the list would blank the document.
    const loaded = { ...RUNBOOK, content_template: { type: "doc", content: [{ type: "heading" }] } };
    mocks.getTemplate.mockResolvedValue(loaded);
    await render();

    await act(async () => container.querySelector("button")!.click());

    expect(mocks.getTemplate).toHaveBeenCalledWith("sys:runbook");
    expect(onApply).toHaveBeenCalledWith(loaded);
  });

  it("says so and changes nothing when the template will not load", async () => {
    mocks.getTemplate.mockRejectedValue(new Error("offline"));
    await render();

    await act(async () => container.querySelector("button")!.click());

    expect(onApply).not.toHaveBeenCalled();
    expect(container.textContent).toContain("could not be loaded");
    expect(container.textContent).toContain("untouched");
  });

  it("renders nothing when there is no template to offer", async () => {
    // A workspace whose only template is Blank has nothing to show, and an empty
    // "pick a template:" prompt above an empty row is worse than no prompt.
    mocks.templates = [BLANK];
    await render();

    expect(container.querySelector("[data-testid='document-empty-state']")).toBeNull();
  });
});
