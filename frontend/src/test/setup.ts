import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import "@testing-library/jest-dom";
import IntlMessageFormat from "intl-messageformat";
import { vi } from "vitest";

// jsdom implements MutationObserver but not ResizeObserver, so any component that
// re-measures on resize throws on mount. Stubbed here rather than per-test because
// it is a gap in the environment, not behaviour worth asserting: a test that cares
// about re-measuring drives it by calling the callback itself.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as typeof globalThis & { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}

// `window.matchMedia` is not implemented in jsdom, and a component that branches
// on a breakpoint throws on mount without it. Defaults to not-matching, which is
// the mobile-first assumption; a test that cares passes its own stub.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/**
 * `useTranslations`, backed by the real English message files.
 *
 * The shorter mock used elsewhere in this suite returns the key itself, which
 * makes every assertion about visible text a test of the key's spelling. Reading
 * `messages/en/*.json` instead means a test asserts the copy a user actually
 * sees, and a key that does not exist throws here rather than rendering as its
 * own name in the browser.
 *
 * A test that wants a different behaviour can still `vi.mock("next-intl")` for
 * itself — a file-level mock wins over this one.
 */
const messages: Record<string, unknown> = {};
const messagesDir = join(process.cwd(), "messages", "en");
for (const file of readdirSync(messagesDir)) {
  if (file.endsWith(".json")) {
    Object.assign(messages, JSON.parse(readFileSync(join(messagesDir, file), "utf8")));
  }
}

function lookup(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      const message = lookup(full);
      if (typeof message !== "string") {
        throw new Error(
          `Missing translation "${full}" — add it to frontend/messages/en/*.json`,
        );
      }
      // Through the real ICU formatter, so `{count, plural, ...}` and `{name}`
      // behave in tests the way next-intl makes them behave in the browser.
      return values ? String(new IntlMessageFormat(message, "en").format(values)) : message;
    };
    return Object.assign(translate, {
      rich: translate,
      raw: (key: string) => lookup(namespace ? `${namespace}.${key}` : key),
      has: (key: string) =>
        typeof lookup(namespace ? `${namespace}.${key}` : key) === "string",
    });
  },
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}));
