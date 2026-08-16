/**
 * Curating a workspace's own templates, from the picker that already lists them.
 *
 * The distinction the picker has to get right is which template is whose. A
 * system template ships with the code: it can be forked and nothing else, and
 * offering a rename that 404s would be worse than offering nothing. A workspace
 * template is the workspace's, so it can be renamed and retired.
 *
 * These controls exist because the endpoints behind them shipped with no caller —
 * a PATCH and a DELETE reachable only by hand-crafting a request. So the tests
 * worth having are the ones that prove the wiring reaches them, and that the
 * two kinds of template are not confused for each other.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplateSelector } from "@/components/docs/TemplateSelector";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  templates: [] as unknown[],
  duplicate: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/hooks/useDocuments", () => ({
  useTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    duplicateTemplate: { mutate: mocks.duplicate, isPending: false },
    updateTemplate: { mutateAsync: mocks.update, isPending: false },
    removeTemplate: { mutateAsync: mocks.remove, isPending: false },
  }),
}));

const SYSTEM = {
  id: "sys:runbook",
  name: "Runbook",
  description: "How to operate a service",
  category: "guides",
  icon: "📕",
  is_system: true,
  variables: [],
};

const OURS = {
  id: "6f1c8a2e-0000-4000-8000-000000000001",
  name: "Incident review",
  description: "Our own version",
  category: "custom",
  icon: "🔥",
  is_system: false,
  variables: [],
};

describe("TemplateSelector curation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelect = vi.fn();

  const byLabel = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === label,
    );

  beforeEach(() => {
    mocks.templates = [SYSTEM, OURS];
    mocks.duplicate.mockReset();
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    onSelect.mockReset();
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
      root.render(
        <TemplateSelector
          workspaceId="ws-1"
          isOpen
          onClose={() => {}}
          onSelect={onSelect}
        />,
      ),
    );

  it("offers rename and retire on a workspace template, and neither on a system one", async () => {
    await render();

    expect(byLabel("Rename Incident review")).toBeDefined();
    expect(byLabel("Retire Incident review")).toBeDefined();
    // A system template lives in code. Renaming it would 404, so it is not offered.
    expect(byLabel("Rename Runbook")).toBeUndefined();
    expect(byLabel("Retire Runbook")).toBeUndefined();
    expect(byLabel("Customise Runbook")).toBeDefined();
  });

  it("renames through the API and closes the editor", async () => {
    await render();
    await act(async () => byLabel("Rename Incident review")!.click());

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Rename Incident review"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "Postmortem");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => byLabel("Save name")!.click());

    expect(mocks.update).toHaveBeenCalledWith({
      templateId: OURS.id,
      name: "Postmortem",
    });
    expect(
      container.querySelector('input[aria-label="Rename Incident review"]'),
    ).toBeNull();
  });

  it("does not save an empty name", async () => {
    // A nameless card cannot be identified again, so this cancels rather than saves.
    await render();
    await act(async () => byLabel("Rename Incident review")!.click());

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Rename Incident review"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "   ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => byLabel("Save name")!.click());

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("asks before retiring, and does nothing if the answer is no", async () => {
    await render();
    await act(async () => byLabel("Retire Incident review")!.click());

    expect(container.textContent).toContain("Retire “Incident review”?");
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    )!;
    await act(async () => cancel.click());

    expect(mocks.remove).not.toHaveBeenCalled();
    // And the card is back, rather than being left in a half-state.
    expect(byLabel("Retire Incident review")).toBeDefined();
  });

  it("retires on confirmation", async () => {
    await render();
    await act(async () => byLabel("Retire Incident review")!.click());
    const confirm = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Retire",
    )!;
    await act(async () => confirm.click());

    expect(mocks.remove).toHaveBeenCalledWith(OURS.id);
  });

  it("does not choose the template when its own controls are used", async () => {
    // The card is a button that starts a document. The controls sit on top of it,
    // so a rename that also created a document would be the obvious way to get
    // this wrong.
    await render();
    await act(async () => byLabel("Rename Incident review")!.click());
    await act(async () => byLabel("Retire Incident review")?.click());

    expect(onSelect).not.toHaveBeenCalled();
  });
});
