import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "@/hooks/useWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACES = [
  { id: "ws-1", name: "Acme" },
  { id: "ws-2", name: "Globex" },
];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "dev-1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api", () => ({
  workspaceApi: {
    list: () => Promise.resolve(WORKSPACES),
    get: (id: string) => Promise.resolve(WORKSPACES.find((w) => w.id === id)),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

/**
 * Two components, two `useWorkspace()` calls, one answer.
 *
 * The selected workspace used to be `useState` inside the hook, so each of the
 * ~270 callers held its own copy. Switching workspace re-rendered whichever
 * component owned the switcher and wrote localStorage; everything else went on
 * querying the workspace you had just left until it happened to remount. On a
 * dashboard, where the switcher and the widgets sit on screen together and
 * nothing remounts, that meant the page simply did not respond.
 */
describe("workspace switching", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  /** Reads the selection; the second instance never calls switchWorkspace. */
  function Reader({ onRender }: { onRender: (id: string | null) => void }) {
    const { currentWorkspaceId } = useWorkspace();
    onRender(currentWorkspaceId);
    return <span data-testid="reader">{currentWorkspaceId ?? "none"}</span>;
  }

  function Switcher() {
    const { switchWorkspace } = useWorkspace();
    return (
      <button data-testid="switch" onClick={() => switchWorkspace("ws-2")}>
        switch
      </button>
    );
  }

  beforeEach(() => {
    localStorage.setItem("token", "fake-token");
    localStorage.setItem("current_workspace_id", "ws-1");
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
    queryClient.clear();
    localStorage.clear();
  });

  it("tells every consumer, not just the one that switched", async () => {
    const seen: (string | null)[] = [];

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Switcher />
          <Reader onRender={(id) => seen.push(id)} />
        </QueryClientProvider>
      );
    });

    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe("ws-1");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="switch"]')!.click();
    });

    // The reader never called switchWorkspace and was never remounted.
    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe("ws-2");
    expect(seen.at(-1)).toBe("ws-2");
    expect(localStorage.getItem("current_workspace_id")).toBe("ws-2");
  });
});
