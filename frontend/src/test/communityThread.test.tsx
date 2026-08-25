import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReactionBar } from "@/components/community/ReactionBar";
import type { CommunityReactionState } from "@/lib/api";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("@/lib/api", () => ({
  communityPublicApi: {
    toggleReaction: mocks.toggle,
    myReactions: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.toggle.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: {
  initial: CommunityReactionState[];
  mine: string[];
  canReact: boolean;
}) {
  act(() => {
    root.render(
      <ReactionBar
        communitySlug="acme"
        channelSlug="help"
        topicParam="thread-ab12cd34ef"
        messageId="m-1"
        {...props}
      />,
    );
  });
}

const chips = () => Array.from(container.querySelectorAll("button"));
const pressed = () =>
  chips()
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);

describe("Reactions on a public message", () => {
  it("shows only used reactions, and no controls, to a signed-out reader", () => {
    render({
      initial: [{ emoji: "👍", count: 3, mine: false }],
      mine: [],
      canReact: false,
    });
    // Offering a button that bounces to a login is worse than not offering one.
    expect(chips()).toHaveLength(0);
    expect(container.textContent).toContain("👍");
    expect(container.textContent).toContain("3");
  });

  it("renders nothing for a signed-out reader when nobody has reacted", () => {
    render({ initial: [], mine: [], canReact: false });
    expect(container.textContent).toBe("");
  });

  it("offers the whole palette to a signed-in reader", () => {
    render({ initial: [], mine: [], canReact: true });
    expect(chips()).toHaveLength(5);
  });

  it("marks the caller's own reactions once they are known", () => {
    // The counts come from a page cached for every anonymous reader, so "mine"
    // arrives separately and afterwards. It has to land on the right chip.
    render({
      initial: [
        { emoji: "👍", count: 2, mine: false },
        { emoji: "🎉", count: 1, mine: false },
      ],
      mine: [],
      canReact: true,
    });
    expect(pressed()).toEqual([]);

    render({
      initial: [
        { emoji: "👍", count: 2, mine: false },
        { emoji: "🎉", count: 1, mine: false },
      ],
      mine: ["🎉"],
      canReact: true,
    });
    expect(pressed().join()).toContain("🎉");
    expect(pressed().join()).not.toContain("👍");
  });

  it("takes the new count from the server rather than guessing", async () => {
    mocks.toggle.mockResolvedValue({ emoji: "👍", count: 4, mine: true });
    render({
      initial: [{ emoji: "👍", count: 3, mine: false }],
      mine: [],
      canReact: true,
    });

    await act(async () => {
      chips()
        .find((b) => b.textContent?.includes("👍"))!
        .click();
    });

    expect(mocks.toggle).toHaveBeenCalledWith(
      "acme",
      "help",
      "thread-ab12cd34ef",
      "m-1",
      "👍",
    );
    const chip = chips().find((b) => b.textContent?.includes("👍"))!;
    expect(chip.textContent).toContain("4");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("drops the chip when the last reaction is removed", async () => {
    mocks.toggle.mockResolvedValue({ emoji: "👍", count: 0, mine: false });
    render({
      initial: [{ emoji: "👍", count: 1, mine: true }],
      mine: ["👍"],
      canReact: true,
    });

    await act(async () => {
      chips()
        .find((b) => b.textContent?.includes("👍"))!
        .click();
    });

    const chip = chips().find((b) => b.textContent?.includes("👍"))!;
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    // Zero is rendered as an empty chip, not as "0".
    expect(chip.textContent).not.toContain("0");
  });

  it("leaves the count alone when the request fails", async () => {
    mocks.toggle.mockRejectedValue(new Error("network"));
    render({
      initial: [{ emoji: "👍", count: 3, mine: false }],
      mine: [],
      canReact: true,
    });

    await act(async () => {
      chips()
        .find((b) => b.textContent?.includes("👍"))!
        .click();
    });

    const chip = chips().find((b) => b.textContent?.includes("👍"))!;
    expect(chip.textContent).toContain("3");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });
});
