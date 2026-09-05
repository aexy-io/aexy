import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CommunityAuthButton } from "@/components/community/CommunityAuthButton";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pathname: { current: "/community/acme" },
  getMe: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ developerApi: { getMe: mocks.getMe } }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.current,
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

let container: HTMLDivElement;
let root: Root;

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  mocks.getMe.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Move the browser to `url` and re-render, as a client navigation would. */
function navigate(url: string) {
  const parsed = new URL(url, "http://localhost");
  mocks.pathname.current = parsed.pathname;
  window.history.pushState({}, "", url);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CommunityAuthButton signedOutVariant="signInToJoin" communitySlug="acme" />
      </QueryClientProvider>,
    );
  });
}

const control = () => container.querySelector("a, button");

/**
 * Render while signed in, then wait for the /developers/me query to settle.
 *
 * Two renders are needed before the request even starts — the mount effect has
 * to read the token before the query is enabled — so this polls rather than
 * flushing a fixed number of microtasks.
 */
async function navigateSignedIn(url: string) {
  localStorage.setItem("token", "jwt");
  navigate(url);
  for (let i = 0; i < 50 && !control(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}


const nextParam = () => {
  const href = container.querySelector("a")?.getAttribute("href") ?? "";
  return new URLSearchParams(href.split("?")[1] ?? "").get("next");
};

describe("Where the community header sends a reader to sign in", () => {
  it("points at the page being read", () => {
    navigate("/community/acme");
    expect(nextParam()).toBe("/community/acme");
  });

  it("follows the reader deeper into the forum", () => {
    // The regression this guards: the button lives in the community layout,
    // which does not remount between these pages. A mount-only effect captured
    // the first URL of the visit, so a reader who arrived at the front page and
    // then opened a thread was returned to the front page after signing in.
    navigate("/community/acme");
    navigate("/community/acme/releases");
    expect(nextParam()).toBe("/community/acme/releases");

    navigate("/community/acme/releases/v240-41d337c562");
    expect(nextParam()).toBe("/community/acme/releases/v240-41d337c562");
  });

  it("keeps up when only the query changes", () => {
    // Pagination moves within one pathname. `usePathname` alone would not
    // notice, which is why the effect has no dependency array.
    navigate("/community/acme/releases");
    navigate("/community/acme/releases?page=2");
    expect(nextParam()).toBe("/community/acme/releases?page=2");
  });

  it("carries the community context that keeps the new account forum-only", () => {
    navigate("/community/acme/releases");
    const href = container.querySelector("a")!.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("context")).toBe("community");
    expect(params.get("community")).toBe("acme");
  });

});

describe("What the community header offers a reader who is already signed in", () => {
  it("offers the app to an internal user", async () => {
    mocks.getMe.mockResolvedValue({ account_type: "internal" });
    await navigateSignedIn("/community/acme/releases");

    expect(control()?.tagName).toBe("A");
    expect(control()?.getAttribute("href")).toBe("/dashboard");
  });

  it("offers a community-only account a way out instead of a door it cannot open", async () => {
    // A community account is 403'd across the whole internal API by the
    // isolation middleware, so "Open app" aimed the only control in the header
    // at the one place it cannot reach — and left it with no way to sign out.
    mocks.getMe.mockResolvedValue({ account_type: "community" });
    await navigateSignedIn("/community/acme/releases");

    expect(control()?.tagName).toBe("BUTTON");
    expect(control()?.textContent).toBe("auth.signOut");
    expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
  });

  it("offers no link at all until it knows which account this is", () => {
    // Rendering "Open app" first and correcting it after the request would hand
    // a community account a live link to a 403 in the meantime.
    mocks.getMe.mockReturnValue(new Promise(() => {}));
    localStorage.setItem("token", "jwt");
    navigate("/community/acme/releases");

    expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("falls back to signing in when the token turns out to be dead", async () => {
    // An expired or revoked token used to render "Open app" and a 401.
    mocks.getMe.mockRejectedValue(new Error("401"));
    await navigateSignedIn("/community/acme/releases");

    expect(nextParam()).toBe("/community/acme/releases");
    expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
  });
});
